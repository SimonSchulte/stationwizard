import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { Einsatz, EinsatzListenEintrag } from '../models/einsatz.model';
import { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import { EinsatzStoreService } from './einsatz-store.service';
import { PepEditorOeffnenDienst } from './pep-editor-oeffnen';

/** Ziel einer Aktion: ein vorhandener Einsatz oder eine HiOrg-Veranstaltung (ggf. ohne Einsatz). */
export type EinsatzZiel = Einsatz | EinsatzListenEintrag | HiorgVeranstaltung;

function istVeranstaltung(ziel: EinsatzZiel): ziel is HiorgVeranstaltung {
  return 'veranstaltungId' in ziel;
}

/** Zeilenschlüssel für `laufend`: Einsatz-Id bzw. `hiorg:<Veranstaltungs-Id>`. */
export function einsatzZielSchluessel(ziel: EinsatzZiel): string {
  return istVeranstaltung(ziel) ? `hiorg:${ziel.veranstaltungId}` : ziel.id;
}

/**
 * Aktionen der Einsatzübersicht: PEP und Aufbau je Einsatz direkt öffnen oder
 * anlegen, ohne Zwischenseite. Für eine HiOrg-Veranstaltung ohne Einsatz wird zuerst still
 * der Einsatz angelegt. Eine laufende Aktion sperrt weitere (`laufend`), damit ein
 * Mehrfachklick nichts doppelt anlegt.
 */
@Injectable({ providedIn: 'root' })
export class EinsatzAktionenDienst {
  private readonly router = inject(Router);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly einsatzStore = inject(EinsatzStoreService);
  private readonly pepEditor = inject(PepEditorOeffnenDienst);

  /** Schlüssel (siehe `einsatzZielSchluessel()`) der gerade laufenden Aktion, sonst `null`. */
  readonly laufend = signal<string | null>(null);

  /**
   * Öffnet die PEP des Einsatzes aus der Datenbank; hat er noch keine, wird sie angelegt
   * (`PepEditorOeffnenDienst`, bei einer HiOrg-Veranstaltung mit einem Posten je Schicht).
   * Ob es eine PEP gibt, zeigen die Kennzahlen `pep` der Einsatzliste.
   */
  async pepOeffnenOderAnlegen(ziel: EinsatzZiel): Promise<void> {
    await this.exklusiv(ziel, async () => {
      const einsatz = await this.einsatzSicherstellen(ziel);
      if (!einsatz) return;
      const eintrag = this.einsatzStore.einsaetze().find((e) => e.id === einsatz.id);
      const vorhanden = eintrag ? eintrag.pep : 'pep' in ziel ? ziel.pep : null;
      try {
        if (vorhanden !== null) await this.pepEditor.oeffnen(einsatz);
        else await this.pepEditor.anlegen(einsatz, istVeranstaltung(ziel) ? ziel : null);
      } catch (fehler) {
        this.meldungen.fehler(
          fehler instanceof Error ? fehler.message : 'Die PEP konnte nicht geöffnet werden.',
        );
      }
    });
  }

  /**
   * Öffnet den Aufbau (Packliste) des Einsatzes. Ob es schon einen gibt, klärt die Seite selbst
   * und bietet sonst „leer beginnen“ oder eine Vorlage an; deshalb braucht es hier keine Abfrage.
   */
  async aufbauOeffnen(ziel: EinsatzZiel): Promise<void> {
    await this.exklusiv(ziel, async () => {
      const einsatz = await this.einsatzSicherstellen(ziel);
      if (!einsatz) return;
      await this.router.navigate(['/einsatzplanung/einsatz', einsatz.id, 'aufbau']);
    });
  }

  /** Der Einsatz zum Ziel; bei einer Veranstaltung ohne Einsatz wird er still angelegt. */
  private async einsatzSicherstellen(ziel: EinsatzZiel): Promise<Einsatz | null> {
    if (!istVeranstaltung(ziel)) {
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
