import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import {
  VorlageWahlDialog,
  VorlageWahlErgebnis,
} from '../components/vorlage-wahl-dialog/vorlage-wahl-dialog';
import { Einsatz, EinsatzListenEintrag } from '../models/einsatz.model';
import { EfsEinsatzGruppe } from '../models/planung.model';
import { EinsatzPepKontext } from './einsatz-pep-kontext';
import { EinsatzStoreService } from './einsatz-store.service';
import { PlanungOeffnenDienst } from './planung-oeffnen';
import { VbEditorStoreService } from './vb-editor-store.service';

/** Ziel einer Aktion: ein vorhandener Einsatz oder eine HiOrg-Veranstaltung (ggf. ohne Einsatz). */
export type EinsatzZiel = Einsatz | EinsatzListenEintrag | EfsEinsatzGruppe;

function istGruppe(ziel: EinsatzZiel): ziel is EfsEinsatzGruppe {
  return 'veranstaltung_id' in ziel;
}

/** Zeilenschlüssel für `laufend`: Einsatz-Id bzw. `hiorg:<Veranstaltungs-Id>`. */
export function einsatzZielSchluessel(ziel: EinsatzZiel): string {
  return istGruppe(ziel) ? `hiorg:${ziel.veranstaltung_id}` : ziel.id;
}

/**
 * Aktionen der Einsatzübersicht: PEP und Vorbereitung (VB) je Einsatz direkt öffnen oder
 * anlegen, ohne Zwischenseite. Für eine HiOrg-Veranstaltung ohne Einsatz wird zuerst still
 * der Einsatz angelegt. Eine laufende Aktion sperrt weitere (`laufend`), damit ein
 * Mehrfachklick nichts doppelt anlegt.
 */
@Injectable({ providedIn: 'root' })
export class EinsatzAktionenDienst {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly einsatzStore = inject(EinsatzStoreService);
  private readonly pepKontext = inject(EinsatzPepKontext);
  private readonly planungOeffnen = inject(PlanungOeffnenDienst);
  private readonly vbEditor = inject(VbEditorStoreService);

  /** Schlüssel (siehe `einsatzZielSchluessel()`) der gerade laufenden Aktion, sonst `null`. */
  readonly laufend = signal<string | null>(null);

  /**
   * Öffnet den PEP des Einsatzes aus Nextcloud; ohne PEP wird er angelegt (aus der
   * HiOrg-Veranstaltung über EFS, sonst als leere Planung) und beim ersten Speichern in
   * Nextcloud mit dem Einsatz verknüpft (`EinsatzPepKontext`).
   */
  async pepOeffnenOderAnlegen(ziel: EinsatzZiel): Promise<void> {
    await this.exklusiv(ziel, async () => {
      const einsatz = await this.einsatzSicherstellen(ziel);
      if (!einsatz) return;
      if (einsatz.pepId) {
        const pepId = einsatz.pepId;
        const ergebnis = await this.planungOeffnen.cloudOeffnen(pepId, (planungId) =>
          this.pepKontext.merken(einsatz.id, planungId, pepId),
        );
        if (ergebnis.fehler) this.meldungen.fehler(ergebnis.fehler);
        return;
      }
      await this.pepAnlegen(einsatz, istGruppe(ziel) ? ziel : null);
    });
  }

  /**
   * Öffnet die Vorbereitung; hat der Einsatz noch keine, fragt der Vorlage-Wahl-Dialog nach
   * Vorlage oder leerem Anfang, legt sie an und öffnet den Editor. Abbrechen ändert nichts.
   */
  async vbOeffnenOderAnlegen(ziel: EinsatzZiel): Promise<void> {
    await this.exklusiv(ziel, async () => {
      const einsatz = await this.einsatzSicherstellen(ziel);
      if (!einsatz) return;
      const eintrag = this.einsatzStore.einsaetze().find((e) => e.id === einsatz.id);
      const vorhanden = eintrag ? eintrag.vb : 'vb' in ziel ? ziel.vb : null;
      if (!vorhanden) {
        const wahl = await firstValueFrom(
          this.dialog
            .open<VorlageWahlDialog, void, VorlageWahlErgebnis>(VorlageWahlDialog, {
              width: '560px',
              maxWidth: '94vw',
            })
            .afterClosed(),
          { defaultValue: undefined },
        );
        if (!wahl) return;
        const angelegt =
          wahl.art === 'vorlage'
            ? await this.vbEditor.ausVorlageAnlegen(einsatz.id, wahl.vorlageId)
            : await this.vbEditor.leerAnlegen(einsatz.id);
        if (!angelegt) {
          this.meldungen.fehler(
            this.vbEditor.ladeFehler() || 'Die Vorbereitung konnte nicht angelegt werden.',
          );
          return;
        }
        // Die Liste zeigt danach „VB öffnen“ mit Kennzahlen.
        void this.einsatzStore.laden();
      }
      await this.router.navigate(['/einsatzplanung/einsatz', einsatz.id, 'vb']);
    });
  }

  private async pepAnlegen(einsatz: Einsatz, gruppe: EfsEinsatzGruppe | null): Promise<void> {
    const merken = (planungId: string) => this.pepKontext.merken(einsatz.id, planungId, null);
    try {
      if (einsatz.hiorgVeranstaltungId) {
        const veranstaltung =
          gruppe ??
          (await this.planungOeffnen.gruppeFuerVeranstaltung(einsatz.hiorgVeranstaltungId));
        if (veranstaltung) {
          await this.planungOeffnen.efsGruppeOeffnen(veranstaltung, merken);
          return;
        }
        this.meldungen.warnung(
          'Die HiOrg-Veranstaltung wurde im Abruf nicht gefunden. Es wurde eine leere Planung angelegt.',
        );
      }
      await this.planungOeffnen.leerePlanungOeffnen(
        einsatz.titel,
        einsatz.beginn,
        einsatz.ende,
        merken,
      );
    } catch (fehler) {
      this.meldungen.fehler(
        fehler instanceof Error ? fehler.message : 'Die Planung konnte nicht angelegt werden.',
      );
    }
  }

  /** Der Einsatz zum Ziel; bei einer Veranstaltung ohne Einsatz wird er still angelegt. */
  private async einsatzSicherstellen(ziel: EinsatzZiel): Promise<Einsatz | null> {
    if (!istGruppe(ziel)) {
      return this.einsatzStore.einsaetze().find((e) => e.id === ziel.id) ?? ziel;
    }
    const einsatz = await this.einsatzStore.einsatzFuerVeranstaltungSicherstellen(ziel);
    if (!einsatz) {
      this.meldungen.fehler(
        this.einsatzStore.fehler() || 'Der Einsatz konnte nicht angelegt werden.',
      );
    }
    return einsatz;
  }

  private async exklusiv(ziel: EinsatzZiel, aktion: () => Promise<void>): Promise<void> {
    if (this.laufend() !== null) return;
    this.laufend.set(einsatzZielSchluessel(ziel));
    try {
      await aktion();
    } finally {
      this.laufend.set(null);
    }
  }
}
