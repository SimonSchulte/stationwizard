import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { vorlageWaehlen } from '../components/vorlage-wahl-dialog/vorlage-wahl-dialog';
import { Einsatz } from '../models/einsatz.model';
import { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import { Einsatzkraft, Planung } from '../models/planung.model';
import { namensSchluessel } from './efs-personal';
import { pepInhaltZuPlanung } from './pep-abbildung';
import { PepEditorKontext } from './pep-editor-kontext';
import { HiorgVeranstaltungenQuelle } from './hiorg-veranstaltungen-quelle.service';
import { PepStoreService } from './pep-store.service';
import { PlanungOeffnenDienst } from './planung-oeffnen';
import { PlanungStoreService } from './planung-store.service';
import { efsTrefferWaehlen } from '../components/efs-treffer-dialog/efs-treffer-dialog';
import { EfsQuelle } from './efs-quelle.service';
import { ImportService } from './import.service';

/**
 * Lokale Zeit `YYYY-MM-DDTHH:mm` (Berliner Ortszeit ohne Zone) als Zeitpunkt, wie der Editor
 * ihn führt (`Planung.start`/`end`: ISO-Zeichenfolge, die er mit lokalen Uhrzeiten anzeigt).
 * Der lokale Text wird als lokale Zeit gelesen – keine Verschiebung um die UTC-Differenz;
 * unlesbare oder fehlende Werte ergeben `null`.
 */
export function einsatzZeitAlsPlanungszeit(lokal: string | null): string | null {
  if (!lokal) return null;
  const datum = new Date(lokal);
  return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
}

/**
 * Öffnet bzw. legt die PEP eines Einsatzes in der Datenbank an und zeigt sie im PEP-Editor.
 *
 * Die Planungs-Id im Editor ist die Einsatz-Id: stabil, eindeutig (eine PEP je Einsatz) und
 * ohne zweite Kennung, die nirgends gespeichert würde. Titel und Zeitraum stammen aus dem
 * Einsatz, nicht aus der PEP; Hiorg-Veranstaltung als `hiorg_einsatz_id`.
 */
@Injectable({ providedIn: 'root' })
export class PepEditorOeffnenDienst {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly pepStore = inject(PepStoreService);
  private readonly planungStore = inject(PlanungStoreService);
  private readonly kontext = inject(PepEditorKontext);
  private readonly planungOeffnen = inject(PlanungOeffnenDienst);
  private readonly veranstaltungen = inject(HiorgVeranstaltungenQuelle);
  private readonly efs = inject(EfsQuelle);
  private readonly importService = inject(ImportService);

  /** Lädt die vorhandene PEP des Einsatzes und öffnet sie im Editor; wirft bei Fehlern. */
  async oeffnen(einsatz: Einsatz): Promise<void> {
    const stand = await this.pepStore.laden(einsatz.id);
    if (!stand) {
      throw new Error(this.pepStore.fehler() || 'Der Einsatz hat noch keine PEP.');
    }
    const start = einsatzZeitAlsPlanungszeit(einsatz.beginn) ?? new Date().toISOString();
    const planung = pepInhaltZuPlanung(stand.daten.inhalt, {
      id: einsatz.id,
      name: einsatz.titel,
      start,
      end: einsatzZeitAlsPlanungszeit(einsatz.ende) ?? start,
      hiorgEinsatzId: einsatz.hiorgVeranstaltungId ?? undefined,
    });
    this.kontext.setzen({ art: 'einsatz', einsatz });
    this.planungStore.oeffneGespeichert(planung);
    await this.router.navigate(['/einsatzplanung/editor']);
  }

  /**
   * Legt die PEP an und öffnet sie: fragt nach Vorlage oder leerem Anfang; bei einer
   * HiOrg-Veranstaltung kommt ein Posten je Schicht aus dem Kalenderfeed als Basis. Abbruch
   * ändert nichts. Ist der Feed nicht erreichbar oder führt die Veranstaltung nicht mehr, warnt
   * eine Meldung und die PEP entsteht ohne Basis.
   */
  async anlegen(einsatz: Einsatz, veranstaltung: HiorgVeranstaltung | null): Promise<void> {
    const wahl = await vorlageWaehlen(this.dialog, 'pep');
    if (!wahl) return;
    const basis = await this.mitEfsPersonal(einsatz, await this.basisBauen(einsatz, veranstaltung));
    const angelegt = await this.pepStore.ausVorlageAnlegen(
      einsatz.id,
      wahl.art === 'vorlage' ? wahl.vorlageId : null,
      basis ?? undefined,
    );
    if (!angelegt) {
      throw new Error(this.pepStore.fehler() || 'Die PEP konnte nicht angelegt werden.');
    }
    await this.oeffnen(einsatz);
  }

  /**
   * Ergänzt die Basis um das Personal des passenden EFS-Einsatzes (Abgleich über den Titel).
   * Bei mehreren möglichen Treffern entscheidet die Person; Abbruch, ein Fehler oder kein
   * Treffer legen die PEP ohne EFS-Personal an – EFS ist nur Zusatzquelle.
   */
  private async mitEfsPersonal(einsatz: Einsatz, basis: Planung | null): Promise<Planung | null> {
    if (!this.efs.erreichbar()) return basis;
    let abgleich = this.efs.abgleich(einsatz.titel, einsatz.beginn);
    if (abgleich.art === 'pruefen') {
      const gewaehlt = await efsTrefferWaehlen(this.dialog, {
        titel: einsatz.titel,
        beginn: einsatz.beginn,
        kandidaten: abgleich.kandidaten,
      });
      if (gewaehlt === undefined) return basis;
      this.efs.entscheide(einsatz.titel, einsatz.beginn, gewaehlt);
      abgleich = this.efs.abgleich(einsatz.titel, einsatz.beginn);
    }
    if (!abgleich.treffer) return basis;
    let kraefte: Einsatzkraft[];
    try {
      const personal = await this.efs.personalLaden(abgleich.treffer);
      kraefte = personal.map((kraft) => this.importService.mapEfsEinsatzkraft(kraft));
    } catch (fehler) {
      this.meldungen.warnung(
        `Das Personal konnte nicht aus EFS geladen werden${fehler instanceof Error ? ` (${fehler.message})` : ''}. Die PEP wird ohne EFS-Personal angelegt.`,
      );
      return basis;
    }
    const start = einsatzZeitAlsPlanungszeit(einsatz.beginn) ?? new Date().toISOString();
    const planung: Planung = basis ?? {
      id: einsatz.id,
      name: einsatz.titel,
      start,
      end: einsatzZeitAlsPlanungszeit(einsatz.ende) ?? start,
      posten: [],
      einsatzkraefte: [],
      einsatzleiter: null,
    };
    const vorhanden = new Set(planung.einsatzkraefte.map((e) => namensSchluessel(e.name)));
    const neue = kraefte.filter((e) => !vorhanden.has(namensSchluessel(e.name)));
    if (neue.length > 0) {
      this.meldungen.erfolg(`${neue.length} Einsatzkräfte aus EFS in den Helferpool übernommen.`);
    }
    return { ...planung, einsatzkraefte: [...planung.einsatzkraefte, ...neue] };
  }

  private async basisBauen(
    einsatz: Einsatz,
    vorgabe: HiorgVeranstaltung | null,
  ): Promise<Planung | null> {
    if (!vorgabe && !einsatz.hiorgVeranstaltungId) return null;
    let veranstaltung = vorgabe;
    if (!veranstaltung) {
      await this.veranstaltungen.sicherstellenGeladen();
      veranstaltung = this.veranstaltungen.veranstaltung(einsatz.hiorgVeranstaltungId ?? '');
    }
    if (!veranstaltung) {
      this.meldungen.warnung(
        'Die Veranstaltung steht nicht im HiOrg-Kalenderfeed. Die PEP wird ohne Posten aus HiOrg angelegt.',
      );
      return null;
    }
    return this.planungOeffnen.planungAusVeranstaltungBauen(veranstaltung);
  }
}
