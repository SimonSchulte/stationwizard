import { Injectable, computed, inject, signal } from '@angular/core';
import { StorageFehler } from '../../kern/storage/datei-storage';
import { diensttagName } from '../../kern/kalender/wochentage';
import { heuteIso, jahrVon } from '../../kern/kalender/datum';
import { WorkerFehler } from '../../kern/worker-client';
import {
  Arbeitsmappe,
  Jahresblatt,
  KatsThema,
  PlanDocument,
  Termin,
  alsJahresblatt,
  alsPlanDocument,
  leeresDocument,
  leeresJahresblatt,
} from '../models/plan.model';
import { ApiKalenderStorage } from '../storage/api-kalender-storage';
import { KalenderStand, KalenderStorage } from '../storage/kalender-storage';
import { DiensttagService } from './diensttag.service';
import { PlanStore } from './plan-store';

/** Verbindung zur Kalender-Datenbank, wie sie die Kopfleiste anzeigt. */
export type DatenbankZustand =
  'ungeprueft' | 'laedt' | 'verbunden' | 'nicht-eingerichtet' | 'fehler';

export interface LadeErgebnis {
  meldungen: string[];
}

export interface SpeicherErgebnis {
  /** Anzahl tatsächlich geschriebener Jahre; 0 = nichts geändert. */
  geschrieben: number;
}

/** Ein Jahr mit Version und dem Stand, der zuletzt gespeichert bzw. geladen wurde. */
interface JahrEintrag {
  blatt: Jahresblatt;
  version: string | null;
  gespeichert: string | null;
}

/**
 * Bindeglied zwischen der Kalender-Datenbank (`KalenderStorage`) und dem
 * Zustand (`PlanStore`). Löst den früheren `WorkbookService` ab: der Store hält
 * weiterhin nur das aktive Jahr samt dessen Ideen, die übrigen Jahre liegen hier.
 *
 * Gespeichert wird nur, was sich gegenüber dem zuletzt gespeicherten Stand
 * tatsächlich geändert hat – jede Schreibung zählt gegen das D1-Kontingent.
 * Jeder Teil nutzt `If-Match` mit seiner eigenen Version bzw. `If-None-Match: *`
 * für ein neues Jahr. Ein Zeitlimit oder Konflikt markiert nichts als gespeichert
 * und löst keine automatische Wiederholung aus.
 */
@Injectable({ providedIn: 'root' })
export class KalenderDatenService {
  private readonly store = inject(PlanStore);
  private readonly diensttag = inject(DiensttagService);
  private readonly storage: KalenderStorage = inject(ApiKalenderStorage);

  private jahre = new Map<number, JahrEintrag>();
  private quellenStand = 0;

  readonly zustand = signal<DatenbankZustand>('ungeprueft');
  readonly fehler = signal('');
  readonly beschaeftigt = signal(false);
  /** Jahre, die im Kalender bereits angelegt sind (aufsteigend), auch ungespeicherte. */
  readonly verfuegbareJahre = signal<number[]>([]);
  /** Die Datenbank ist erreichbar, enthält aber noch kein Jahr – Anlass für die Excel-Übernahme. */
  readonly istLeer = computed(
    () => this.zustand() === 'verbunden' && this.verfuegbareJahre().length === 0,
  );

  async laden(): Promise<LadeErgebnis> {
    this.beginneOperation();
    const stand = this.store.dokument();
    const quellenStand = this.quellenStand;
    this.zustand.set('laedt');
    try {
      let kalender: KalenderStand;
      try {
        kalender = await this.storage.laden();
      } catch (ursache) {
        this.merkeFehler(ursache);
        throw ursache;
      }
      if (this.store.dokument() !== stand || this.quellenStand !== quellenStand) {
        this.zustand.set('verbunden');
        throw new StorageFehler(
          'Der Kalender wurde während des Ladens geändert. Deine Änderungen bleiben erhalten. ' +
            'Sichere sie als Excel-Kopie und lade danach erneut.',
        );
      }
      return this.uebernimm(kalender);
    } finally {
      this.beschaeftigt.set(false);
    }
  }

  /**
   * Übernimmt einen vollständigen Stand ohne erneuten Abruf – nach der
   * Excel-Migration liefert der Worker ihn bereits mit.
   */
  uebernimm(kalender: KalenderStand): LadeErgebnis {
    this.quellenStand++;
    this.jahre = new Map(
      kalender.jahre.map(({ blatt, version }) => [
        blatt.jahr,
        { blatt, version, gespeichert: JSON.stringify(blatt) },
      ]),
    );
    this.aktualisiereJahre();
    this.zustand.set('verbunden');
    this.fehler.set('');

    const jahre = this.verfuegbareJahre();
    if (!jahre.length) {
      // Leerer Kalender: kein Diensttagsgerüst anlegen, sonst verschwände der
      // Hinweis auf die Excel-Übernahme hinter lauter leeren Zeilen.
      this.store.setzeDokument(leeresDocument());
      return { meldungen: [] };
    }
    const laufend = jahrVon(heuteIso());
    const zielJahr = jahre.includes(laufend) ? laufend : jahre.at(-1)!;
    this.store.setzeDokument(alsPlanDocument(this.jahre.get(zielJahr)!.blatt));
    const ergaenzt = this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
    return {
      meldungen: ergaenzt
        ? [
            `${ergaenzt} fehlende(r) ${diensttagName(this.diensttag.wochentag())} als Zeilen ergänzt.`,
          ]
        : [],
    };
  }

  /** Schreibt jedes geänderte Jahr; Termine, Ideen und Themen gehören zur selben Zeile. */
  async speichern(): Promise<SpeicherErgebnis> {
    this.beginneOperation();
    if (this.zustand() !== 'verbunden') {
      this.beschaeftigt.set(false);
      throw new StorageFehler(
        'Die Kalender-Datenbank ist nicht verbunden. Lade den Kalender neu oder sichere ' +
          'deine Änderungen als Excel-Kopie.',
      );
    }
    const stand = this.store.dokument();
    const quellenStand = this.quellenStand;
    let geschrieben = 0;
    try {
      this.merkeAktivesJahr(stand);
      for (const eintrag of [...this.jahre.values()].sort((a, b) => a.blatt.jahr - b.blatt.jahr)) {
        const inhalt = JSON.stringify(eintrag.blatt);
        if (inhalt === eintrag.gespeichert) continue;
        const version = await this.storage.speichereJahr(eintrag.blatt, eintrag.version);
        if (this.quellenStand !== quellenStand) return { geschrieben };
        eintrag.version = version;
        eintrag.gespeichert = inhalt;
        geschrieben++;
      }
      this.store.alsGespeichertMarkieren(stand);
      return { geschrieben };
    } finally {
      this.beschaeftigt.set(false);
    }
  }

  /** Alle Jahre – für den Excel-Download als lokaler Rettungsweg. */
  arbeitsmappe(): Arbeitsmappe {
    const stand = this.store.dokument();
    const jahre = [...this.jahre.values()]
      .map((e) => (e.blatt.jahr === stand.jahr ? alsJahresblatt(stand) : e.blatt))
      .sort((a, b) => a.jahr - b.jahr);
    if (!jahre.some((j) => j.jahr === stand.jahr) && this.store.hatDaten()) {
      jahre.push(alsJahresblatt(stand));
    }
    return { jahre };
  }

  /** Erzeugt die Excel-Arbeitsmappe ohne sie abzulegen. */
  async exportieren(): Promise<{ daten: ArrayBuffer; dateiname: string }> {
    const { schreibeArbeitsmappe } = await import('./excel-schreiben');
    return {
      daten: schreibeArbeitsmappe(this.arbeitsmappe()),
      dateiname: `Kalender-${heuteIso()}.xlsx`,
    };
  }

  /** Wechselt zu einem bereits vorhandenen Jahr; ungespeicherte Jahre bleiben erhalten. */
  waehleJahr(jahr: number): void {
    const stand = this.store.dokument();
    if (jahr === stand.jahr) {
      return;
    }
    this.merkeAktivesJahr(stand);
    const eintrag = this.jahre.get(jahr);
    if (!eintrag) {
      return;
    }
    const warUngespeichert = this.store.ungespeichert();
    this.store.setzeDokument(alsPlanDocument(eintrag.blatt));
    if (warUngespeichert || this.hatUngespeicherteJahre()) {
      this.store.ungespeichert.set(true);
    }
  }

  /** Legt ein neues, leeres Jahr an und wechselt dorthin; gespeichert wird es erst mit „Speichern“. */
  neuesJahr(jahr: number): void {
    if (this.jahre.has(jahr)) {
      this.waehleJahr(jahr);
      return;
    }
    const stand = this.store.dokument();
    if (this.jahre.size || this.store.hatDaten()) {
      this.merkeAktivesJahr(stand);
    }
    const blatt = leeresJahresblatt(jahr);
    this.jahre.set(jahr, { blatt, version: null, gespeichert: null });
    this.aktualisiereJahre();
    this.store.setzeDokument(alsPlanDocument(blatt));
    this.store.ergaenzeFehlendeDiensttage(this.diensttag.wochentag());
    this.store.ungespeichert.set(true);
  }

  /** Aktueller Stand eines Jahres, auch des gerade bearbeiteten; `undefined` für unbekannte Jahre. */
  blatt(jahr: number): Jahresblatt | undefined {
    const stand = this.store.dokument();
    if (jahr === stand.jahr && (this.jahre.has(jahr) || this.store.hatDaten())) {
      return alsJahresblatt(stand);
    }
    return this.jahre.get(jahr)?.blatt;
  }

  /**
   * Hängt Ideen und KatS-Themen an die Listen des Zieljahres an und wechselt dorthin.
   * Gespeichert wird erst mit „Speichern“; bis dahin lässt sich die Übernahme
   * rückgängig machen.
   */
  uebernehmeInJahr(ziel: number, ideen: Termin[], katsThemen: KatsThema[]): void {
    this.waehleJahr(ziel);
    if (this.store.jahr() !== ziel) {
      throw new StorageFehler(`Das Jahr ${ziel} ist im Kalender nicht angelegt.`);
    }
    this.store.fuegeUebernahmeEin(ideen, katsThemen);
  }

  private merkeAktivesJahr(stand: PlanDocument): void {
    const vorhanden = this.jahre.get(stand.jahr);
    this.jahre.set(stand.jahr, {
      blatt: alsJahresblatt(stand),
      version: vorhanden?.version ?? null,
      gespeichert: vorhanden?.gespeichert ?? null,
    });
    this.aktualisiereJahre();
  }

  private hatUngespeicherteJahre(): boolean {
    return [...this.jahre.values()].some((e) => JSON.stringify(e.blatt) !== e.gespeichert);
  }

  private aktualisiereJahre(): void {
    this.verfuegbareJahre.set([...this.jahre.keys()].sort((a, b) => a - b));
  }

  private merkeFehler(ursache: unknown): void {
    if (ursache instanceof WorkerFehler && ursache.status === 503) {
      this.zustand.set('nicht-eingerichtet');
      this.fehler.set('');
      return;
    }
    this.zustand.set('fehler');
    this.fehler.set(ursache instanceof Error ? ursache.message : String(ursache));
  }

  private beginneOperation(): void {
    if (this.beschaeftigt()) {
      throw new StorageFehler(
        'Der Kalender wird bereits geladen oder gespeichert. Bitte warte, bis der Vorgang beendet ist.',
      );
    }
    this.beschaeftigt.set(true);
  }
}
