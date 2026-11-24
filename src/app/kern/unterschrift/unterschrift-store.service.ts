import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../worker-client';
import { pruefeUnterschrift, UnterschriftDaten } from './unterschrift.model';

const PFAD = '/api/benutzer/unterschrift';

interface Antwort {
  unterschrift?: unknown;
}

/** Die eigene hinterlegte Unterschrift der angemeldeten Person (ein Aufruf, bei Bedarf geladen). */
@Injectable({ providedIn: 'root' })
export class UnterschriftStoreService {
  private readonly worker = inject(WorkerClient);

  /** `undefined` solange nicht geladen, `null` wenn keine hinterlegt ist. */
  readonly unterschrift = signal<UnterschriftDaten | null | undefined>(undefined);
  readonly fehler = signal('');
  readonly speichertGerade = signal(false);

  /** Lädt höchstens einmal; mit `neu` erzwingt es einen frischen Abruf. */
  async laden(neu = false): Promise<UnterschriftDaten | null> {
    const aktuell = this.unterschrift();
    if (aktuell !== undefined && !neu) return aktuell;
    this.fehler.set('');
    try {
      const antwort = await this.worker.json<Antwort>(PFAD);
      const daten = antwort.unterschrift == null ? null : pruefeUnterschrift(antwort.unterschrift);
      this.unterschrift.set(daten);
      return daten;
    } catch (ursache) {
      this.fehler.set(fehlertext(ursache));
      return null;
    }
  }

  async speichern(daten: UnterschriftDaten): Promise<boolean> {
    this.speichertGerade.set(true);
    this.fehler.set('');
    try {
      const antwort = await this.worker.json<Antwort>(PFAD, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(daten),
      });
      const geprueft = pruefeUnterschrift(antwort.unterschrift);
      this.unterschrift.set(geprueft);
      return geprueft !== null;
    } catch (ursache) {
      this.fehler.set(fehlertext(ursache));
      return false;
    } finally {
      this.speichertGerade.set(false);
    }
  }

  async entfernen(): Promise<boolean> {
    this.fehler.set('');
    try {
      await this.worker.json<Antwort>(PFAD, { method: 'DELETE' });
      this.unterschrift.set(null);
      return true;
    } catch (ursache) {
      this.fehler.set(fehlertext(ursache));
      return false;
    }
  }
}

function fehlertext(ursache: unknown): string {
  return ursache instanceof WorkerFehler
    ? ursache.message
    : 'Die Unterschrift konnte nicht verarbeitet werden.';
}
