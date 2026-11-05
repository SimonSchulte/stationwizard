import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { vorlageWaehlen } from '../components/vorlage-wahl-dialog/vorlage-wahl-dialog';
import { Einsatz } from '../models/einsatz.model';
import { EfsEinsatzGruppe, Planung } from '../models/planung.model';
import { pepInhaltZuPlanung } from './pep-abbildung';
import { PepEditorKontext } from './pep-editor-kontext';
import { PepStoreService } from './pep-store.service';
import { PlanungOeffnenDienst } from './planung-oeffnen';
import { PlanungStoreService } from './planung-store.service';

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
   * HiOrg-Veranstaltung kommen Posten und Einsatzkräfte aus dem EFS-Abruf als Basis. Abbruch
   * ändert nichts. Fehler (auch beim HiOrg-Abruf) wirft, ohne etwas anzulegen; fehlt die Veranstaltung im EFS-Abruf, warnt
   * eine Meldung und die PEP entsteht ohne Basis.
   */
  async anlegen(einsatz: Einsatz, gruppe: EfsEinsatzGruppe | null): Promise<void> {
    const wahl = await vorlageWaehlen(this.dialog, 'pep');
    if (!wahl) return;
    const basis = await this.basisBauen(einsatz, gruppe);
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

  private async basisBauen(
    einsatz: Einsatz,
    gruppeVorgabe: EfsEinsatzGruppe | null,
  ): Promise<Planung | null> {
    if (!gruppeVorgabe && !einsatz.hiorgVeranstaltungId) return null;
    const gruppe =
      gruppeVorgabe ??
      (await this.planungOeffnen.gruppeFuerVeranstaltung(einsatz.hiorgVeranstaltungId ?? ''));
    if (!gruppe) {
      this.meldungen.warnung(
        'Die Veranstaltung ist nicht im EFS-Abruf. Die PEP wird ohne Einsatzkräfte aus HiOrg angelegt.',
      );
      return null;
    }
    return this.planungOeffnen.planungAusEfsBauen(gruppe);
  }
}
