import { Injectable, inject, signal } from '@angular/core';
import { diensttagName } from '../../kern/kalender/wochentage';
import { PlanDocument } from '../models/plan.model';
import { StorageFehler, WorkbookStorage } from '../storage/workbook-storage';
import { DiensttagService } from './diensttag.service';
import { PlanStore } from './plan-store';

export interface LadeErgebnis {
  meldungen: string[];
}

/**
 * Bindeglied zwischen Persistenz (`WorkbookStorage`) und Zustand (`PlanStore`).
 *
 * Die Views kennen nur diesen Service; ob dahinter eine hochgeladene Datei
 * oder eine NextCloud steckt, spielt für sie keine Rolle.
 */
@Injectable({ providedIn: 'root' })
export class WorkbookService {
  private readonly store = inject(PlanStore);
  private readonly diensttag = inject(DiensttagService);

  private readonly aktivesZiel = signal<WorkbookStorage | null>(null);
  /** Ein fehlgeschlagener Reload kann bereits den ETag des Speicherobjekts geändert haben. */
  private readonly ungepruefteZiele = new WeakSet<WorkbookStorage>();
  private quellenStand = 0;
  readonly ziel = this.aktivesZiel.asReadonly();
  readonly beschaeftigt = signal(false);

  async laden(storage: WorkbookStorage): Promise<LadeErgebnis> {
    this.beginneOperation();
    const stand = this.store.dokument();
    const quellenStand = this.quellenStand;
    this.ungepruefteZiele.add(storage);
    try {
      const inhalt = await storage.laden();
      const { leseArbeitsmappe } = await import('./excel-lesen');
      const { dokument, meldungen } = leseArbeitsmappe(inhalt.daten);
      if (this.store.dokument() !== stand || this.quellenStand !== quellenStand) {
        throw new StorageFehler(
          'Der Ausbildungsplan wurde während des Ladens geändert. ' +
            'Deine Änderungen bleiben erhalten. Sichere sie als Kopie und lade danach erneut.',
        );
      }
      this.store.setzeDokument(dokument);
      this.aktivesZiel.set(storage);
      this.quellenStand++;
      this.ungepruefteZiele.delete(storage);
      const ergaenzt = this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
      return {
        meldungen: ergaenzt
          ? [
              ...meldungen,
              `${ergaenzt} fehlende(r) ${diensttagName(this.diensttag.wochentag())} als Zeilen ergänzt.`,
            ]
          : meldungen,
      };
    } finally {
      this.beschaeftigt.set(false);
    }
  }

  /** Lädt vom aktiven Ziel neu und verwirft ungespeicherte Änderungen. */
  async neuLaden(): Promise<LadeErgebnis> {
    const storage = this.aktivesZiel();
    if (!storage) {
      throw new StorageFehler('Es ist keine Quelle geöffnet.');
    }
    return this.laden(storage);
  }

  async speichern(): Promise<void> {
    const storage = this.aktivesZiel();
    if (!storage) {
      throw new StorageFehler('Es ist keine Quelle geöffnet.');
    }
    await this.speichernIn(storage);
  }

  /** Speichert den aktuellen Stand in ein beliebiges Ziel (z. B. "Kopie ablegen"). */
  async speichernIn(storage: WorkbookStorage): Promise<void> {
    if (this.ungepruefteZiele.has(storage)) {
      throw new StorageFehler(
        'Die Quelle wurde nicht vollständig übernommen. Sichere deine Änderungen als Kopie ' +
          'und lade die Arbeitsmappe erneut, bevor du sie überschreibst.',
      );
    }
    this.beginneOperation();
    const stand = this.store.dokument();
    const dateiname = this.dateiname();
    const quellenStand = this.quellenStand;
    try {
      const daten = await this.baueArbeitsmappe(stand);
      await storage.speichern(daten, dateiname);
      if (storage === this.aktivesZiel() && this.quellenStand === quellenStand) {
        this.store.alsGespeichertMarkieren(stand);
      }
    } finally {
      this.beschaeftigt.set(false);
    }
  }

  /** Erzeugt die Arbeitsmappe ohne sie abzulegen – für Download/Export. */
  async exportieren(): Promise<{ daten: ArrayBuffer; dateiname: string; stand: PlanDocument }> {
    const stand = this.store.dokument();
    const dateiname = this.dateiname();
    return { daten: await this.baueArbeitsmappe(stand), dateiname, stand };
  }

  /** Der Excel-Code wird erst bei Bedarf geladen – er dominiert sonst das Startbundle. */
  private async baueArbeitsmappe(stand: PlanDocument): Promise<ArrayBuffer> {
    const { schreibeArbeitsmappe } = await import('./excel-schreiben');
    return schreibeArbeitsmappe(stand);
  }

  /** Startet mit einem leeren Plan, ohne Datei. */
  neuesDokument(dokument: PlanDocument): void {
    this.quellenStand++;
    this.store.setzeDokument(dokument);
    this.aktivesZiel.set(null);
    this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
  }

  private beginneOperation(): void {
    if (this.beschaeftigt()) {
      throw new StorageFehler(
        'Eine Arbeitsmappe wird bereits geladen oder gespeichert. Bitte warte, bis der Vorgang beendet ist.',
      );
    }
    this.beschaeftigt.set(true);
  }

  private dateiname(): string {
    const vorhanden = this.aktivesZiel()?.bezeichnung ?? '';
    const treffer = /([^/\\·\s]+\.xlsx)$/i.exec(vorhanden.trim());
    return treffer ? treffer[1] : `Rahmenplan_${this.store.jahr()}.xlsx`;
  }
}
