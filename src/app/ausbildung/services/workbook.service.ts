import { Injectable, inject, signal } from '@angular/core';
import { diensttagName } from '../../kern/kalender/wochentage';
import {
  Arbeitsmappe,
  PlanDocument,
  alsJahresblatt,
  alsPlanDocument,
  leeresJahresblatt,
} from '../models/plan.model';
import { StorageFehler, WorkbookStorage } from '../storage/workbook-storage';
import { DiensttagService } from './diensttag.service';
import { PlanStore } from './plan-store';

export interface LadeErgebnis {
  meldungen: string[];
}

const LEERE_ARBEITSMAPPE: Arbeitsmappe = { jahre: [], backlog: [] };

/**
 * Bindeglied zwischen Persistenz (`WorkbookStorage`) und Zustand (`PlanStore`).
 *
 * Die Views kennen nur diesen Service; ob dahinter eine hochgeladene Datei
 * oder eine NextCloud steckt, spielt für sie keine Rolle. Der Store hält jeweils
 * nur das aktive Jahresblatt; die übrigen Jahresblätter der Arbeitsmappe bleiben
 * hier zwischengespeichert und werden beim Speichern bzw. Jahreswechsel eingemischt.
 */
@Injectable({ providedIn: 'root' })
export class WorkbookService {
  private readonly store = inject(PlanStore);
  private readonly diensttag = inject(DiensttagService);

  private readonly aktivesZiel = signal<WorkbookStorage | null>(null);
  /** Ein fehlgeschlagener Reload kann bereits den ETag des Speicherobjekts geändert haben. */
  private readonly ungepruefteZiele = new WeakSet<WorkbookStorage>();
  private quellenStand = 0;
  private arbeitsmappe: Arbeitsmappe = LEERE_ARBEITSMAPPE;

  readonly ziel = this.aktivesZiel.asReadonly();
  readonly beschaeftigt = signal(false);
  /** Jahre, für die die geöffnete Arbeitsmappe bereits ein Jahresblatt hat (aufsteigend). */
  readonly verfuegbareJahre = signal<number[]>([]);

  async laden(storage: WorkbookStorage): Promise<LadeErgebnis> {
    this.beginneOperation();
    const stand = this.store.dokument();
    const quellenStand = this.quellenStand;
    this.ungepruefteZiele.add(storage);
    try {
      const inhalt = await storage.laden();
      const { leseArbeitsmappe } = await import('./excel-lesen');
      const { arbeitsmappe, meldungen } = leseArbeitsmappe(inhalt.daten);
      if (this.store.dokument() !== stand || this.quellenStand !== quellenStand) {
        throw new StorageFehler(
          'Der Ausbildungsplan wurde während des Ladens geändert. ' +
            'Deine Änderungen bleiben erhalten. Sichere sie als Kopie und lade danach erneut.',
        );
      }
      this.arbeitsmappe = arbeitsmappe;
      const jahre = arbeitsmappe.jahre.map((j) => j.jahr).sort((a, b) => a - b);
      this.verfuegbareJahre.set(jahre);
      const zielJahr = jahre.at(-1) ?? new Date().getFullYear();
      const blatt =
        arbeitsmappe.jahre.find((j) => j.jahr === zielJahr) ?? leeresJahresblatt(zielJahr);
      this.store.setzeDokument(alsPlanDocument(blatt, arbeitsmappe.backlog));
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
      const arbeitsmappe = this.mitAktivemJahr(stand);
      const daten = await this.baueArbeitsmappe(arbeitsmappe);
      await storage.speichern(daten, dateiname);
      if (storage === this.aktivesZiel() && this.quellenStand === quellenStand) {
        this.arbeitsmappe = arbeitsmappe;
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
    const arbeitsmappe = this.mitAktivemJahr(stand);
    return { daten: await this.baueArbeitsmappe(arbeitsmappe), dateiname, stand };
  }

  /** Der Excel-Code wird erst bei Bedarf geladen – er dominiert sonst das Startbundle. */
  private async baueArbeitsmappe(arbeitsmappe: Arbeitsmappe): Promise<ArrayBuffer> {
    const { schreibeArbeitsmappe } = await import('./excel-schreiben');
    return schreibeArbeitsmappe(arbeitsmappe);
  }

  /** Bettet das aktive Jahresblatt in die übrigen Jahresblätter der Arbeitsmappe ein. */
  private mitAktivemJahr(stand: PlanDocument): Arbeitsmappe {
    const jahre = [
      ...this.arbeitsmappe.jahre.filter((j) => j.jahr !== stand.jahr),
      alsJahresblatt(stand),
    ];
    return { jahre, backlog: stand.backlog };
  }

  /** Startet mit einem leeren Plan, ohne Datei und ohne andere Jahresblätter. */
  neuesDokument(dokument: PlanDocument): void {
    this.quellenStand++;
    this.arbeitsmappe = LEERE_ARBEITSMAPPE;
    this.verfuegbareJahre.set([dokument.jahr]);
    this.store.setzeDokument(dokument);
    this.aktivesZiel.set(null);
    this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
  }

  /** Wechselt zu einem bereits vorhandenen Jahresblatt der geöffneten Arbeitsmappe. */
  waehleJahr(jahr: number): void {
    if (jahr === this.store.jahr()) {
      return;
    }
    const warUngespeichert = this.store.ungespeichert();
    this.arbeitsmappe = this.mitAktivemJahr(this.store.dokument());
    const blatt = this.arbeitsmappe.jahre.find((j) => j.jahr === jahr);
    if (!blatt) {
      return;
    }
    this.store.setzeDokument(alsPlanDocument(blatt, this.arbeitsmappe.backlog));
    if (warUngespeichert) {
      this.store.ungespeichert.set(true);
    }
  }

  /** Legt ein neues, leeres Jahresblatt in der Arbeitsmappe an und wechselt dorthin. */
  neuesJahr(jahr: number): void {
    if (this.verfuegbareJahre().includes(jahr)) {
      this.waehleJahr(jahr);
      return;
    }
    const bisherige = this.mitAktivemJahr(this.store.dokument());
    const blatt = leeresJahresblatt(jahr);
    this.arbeitsmappe = { jahre: [...bisherige.jahre, blatt], backlog: bisherige.backlog };
    this.verfuegbareJahre.set(this.arbeitsmappe.jahre.map((j) => j.jahr).sort((a, b) => a - b));
    this.store.setzeDokument(alsPlanDocument(blatt, this.arbeitsmappe.backlog));
    this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
    this.store.ungespeichert.set(true);
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
    return treffer ? treffer[1] : 'Rahmenplan.xlsx';
  }
}
