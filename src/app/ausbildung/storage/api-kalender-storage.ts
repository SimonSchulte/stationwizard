import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Arbeitsmappe, Jahresblatt, Termin } from '../models/plan.model';
import { leseKalenderStand } from './kalender-pruefung';
import {
  KalenderBereitsBefuelltFehler,
  KalenderKonfliktFehler,
  KalenderStand,
  KalenderStorage,
} from './kalender-storage';

/**
 * Adapter gegen `/api/kalender` (Worker/D1). Übersetzt zwischen Worker-JSON und
 * Domänentypen an genau dieser Stelle.
 *
 * Bewusst ohne `AbrufPuffer`: der eine Lesezugriff liefert die Versionen für
 * ein späteres `If-Match` und fällt damit unter „versionierte Einzelabrufe
 * bleiben ungepuffert“. Er ist zugleich der einzige Lesezugriff – alle Jahre und
 * die Ideen kommen in einem Aufruf.
 */
@Injectable({ providedIn: 'root' })
export class ApiKalenderStorage implements KalenderStorage {
  private readonly worker = inject(WorkerClient);

  async laden(): Promise<KalenderStand> {
    const antwort = await this.worker.anfragen('/api/kalender', { cache: 'no-store' });
    return this.leseStand(antwort);
  }

  async speichereJahr(blatt: Jahresblatt, version: string | null): Promise<string> {
    return this.schreibe(
      version === null ? '/api/kalender/jahre' : `/api/kalender/jahre/${blatt.jahr}`,
      version === null ? 'POST' : 'PUT',
      version,
      blatt,
      `Das Jahr ${blatt.jahr}`,
    );
  }

  async speichereIdeen(termine: Termin[], version: string | null): Promise<string> {
    return this.schreibe('/api/kalender/ideen', 'PUT', version, { termine }, 'Die Ideensammlung');
  }

  async migriere(arbeitsmappe: Arbeitsmappe): Promise<KalenderStand> {
    try {
      const antwort = await this.worker.anfragen('/api/kalender/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
        body: JSON.stringify({ jahre: arbeitsmappe.jahre, ideen: arbeitsmappe.backlog }),
      });
      return this.leseStand(antwort);
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 409) {
        throw new KalenderBereitsBefuelltFehler();
      }
      throw ursache;
    }
  }

  private async schreibe(
    pfad: string,
    methode: 'POST' | 'PUT',
    version: string | null,
    inhalt: unknown,
    teil: string,
  ): Promise<string> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (version === null) headers.set('If-None-Match', '*');
    else headers.set('If-Match', version);
    try {
      const antwort = await this.worker.anfragen(pfad, {
        method: methode,
        headers,
        body: JSON.stringify(inhalt),
      });
      const neueVersion = antwort.headers.get('ETag');
      if (!neueVersion) {
        throw new WorkerFehler('Der Server hat keine gültige Version geliefert.', 502);
      }
      return neueVersion;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 412) {
        throw new KalenderKonfliktFehler(teil);
      }
      throw ursache;
    }
  }

  private async leseStand(antwort: Response): Promise<KalenderStand> {
    if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
      throw new WorkerFehler('Der Server hat keine gültige API-Antwort geliefert.', 502);
    }
    let inhalt: unknown;
    try {
      inhalt = await antwort.json();
    } catch {
      throw new WorkerFehler('Die Serverantwort konnte nicht gelesen werden.', 502);
    }
    const stand = leseKalenderStand(inhalt);
    if (!stand) {
      throw new WorkerFehler('Der Server hat ungültige Kalenderdaten geliefert.', 502);
    }
    return stand;
  }
}
