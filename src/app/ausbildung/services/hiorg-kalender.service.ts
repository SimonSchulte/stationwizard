import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import type { HiorgEintrag } from '../models/hiorg-kalender.model';
import { leseHiorgAntwort } from './hiorg-kalender-parser';

export type HiorgZustand = 'ungeprueft' | 'geladen' | 'nicht-konfiguriert' | 'fehler';

/**
 * Die HiOrg-Termine des Verbands, gelesen über den Worker.
 *
 * Der Feed ist eine reine Anzeige- und Abgleichquelle: er wird **nicht**
 * zwischengespeichert und nie in die Excel-Mappe geschrieben. Die Ebene ist
 * immer eingeblendet, sobald ein Rahmenplan offen ist – keine Ansichtsvorliebe.
 *
 * Ein Fehlschlag ist nie blockierend: der Jahresplan arbeitet ohne die Ebene
 * unverändert weiter, wie bei der Feiertags-Rückfallebene.
 */
@Injectable({ providedIn: 'root' })
export class HiorgKalenderService {
  private readonly worker = inject(WorkerClient);
  private laufend: Promise<void> | null = null;

  readonly eintraege = signal<readonly HiorgEintrag[]>([]);
  readonly zustand = signal<HiorgZustand>('ungeprueft');
  readonly fehler = signal('');
  readonly verworfen = signal(0);
  readonly laedt = signal(false);

  async lade(erzwingen = false): Promise<void> {
    if (!erzwingen && this.zustand() === 'geladen') {
      return;
    }
    this.laufend ??= this.abrufen().finally(() => {
      this.laufend = null;
    });
    return this.laufend;
  }

  private async abrufen(): Promise<void> {
    this.laedt.set(true);
    try {
      const rohdaten = await this.worker.json<unknown>('/api/hiorg/kalender');
      const { eintraege, verworfen } = leseHiorgAntwort(rohdaten);
      this.eintraege.set(eintraege);
      this.verworfen.set(verworfen);
      this.zustand.set('geladen');
      this.fehler.set('');
    } catch (ursache) {
      this.eintraege.set([]);
      this.verworfen.set(0);
      if (ursache instanceof WorkerFehler && ursache.status === 503) {
        // Noch nicht eingerichtet ist kein Fehler des Nutzers – nur ein Hinweis.
        this.zustand.set('nicht-konfiguriert');
        this.fehler.set('');
      } else {
        this.zustand.set('fehler');
        this.fehler.set(ursache instanceof Error ? ursache.message : String(ursache));
      }
    } finally {
      this.laedt.set(false);
    }
  }
}
