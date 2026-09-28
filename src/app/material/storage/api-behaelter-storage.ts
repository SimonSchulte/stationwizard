import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Behaelter, BehaelterUebersicht } from '../models/behaelter.model';
import { istBehaelter, istBehaelterUebersicht } from '../services/material-pruefung';
import {
  BehaelterInBenutzungFehler,
  BehaelterKonfliktFehler,
  BehaelterMitVersion,
  BehaelterStorage,
  BehaelterVerweisFehler,
} from './behaelter-storage';
import { MaterialAbrufPuffer } from './material-abruf-puffer';

interface BehaelterListenAntwort {
  behaelter: unknown[];
}

/** Adapter gegen `/api/material/behaelter`. */
@Injectable({ providedIn: 'root' })
export class ApiBehaelterStorage implements BehaelterStorage {
  readonly bezeichnung = 'Behälter (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(MaterialAbrufPuffer);

  async ladeUebersicht(): Promise<BehaelterUebersicht[]> {
    return this.puffer.behaelter.hole('alle', async () => {
      const antwort = await this.worker.json<BehaelterListenAntwort>('/api/material/behaelter');
      return antwort.behaelter.filter(istBehaelterUebersicht);
    });
  }

  async ladeBehaelter(id: string): Promise<BehaelterMitVersion | null> {
    try {
      const antwort = await this.worker.anfragen(`/api/material/behaelter/${id}`);
      if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
        throw new WorkerFehler('Der Server hat keine gültige API-Antwort geliefert.', 502);
      }
      let inhalt: unknown;
      try {
        inhalt = await antwort.json();
      } catch {
        throw new WorkerFehler('Die Serverantwort konnte nicht gelesen werden.', 502);
      }
      const version = antwort.headers.get('ETag');
      if (!istBehaelter(inhalt) || !version) {
        throw new WorkerFehler('Der Server hat einen ungültigen Behälter geliefert.', 502);
      }
      return { daten: inhalt, version };
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
      throw ursache;
    }
  }

  async speichereBehaelter(behaelter: Behaelter, version: string | null): Promise<string> {
    const pfad =
      version === null ? '/api/material/behaelter' : `/api/material/behaelter/${behaelter.id}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (version === null) headers.set('If-None-Match', '*');
    else headers.set('If-Match', version);
    try {
      const antwort = await this.worker.anfragen(pfad, {
        method: version === null ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(behaelter),
      });
      const neueVersion = antwort.headers.get('ETag');
      if (!neueVersion) {
        throw new WorkerFehler('Der Server hat keine gültige Version geliefert.', 502);
      }
      this.puffer.verwerfen();
      return neueVersion;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 412) {
        throw new BehaelterKonfliktFehler(behaelter.id);
      }
      // Beim Speichern bedeutet 409 immer einen ungültigen Verweis auf Fahrzeug
      // oder Prüfvorlage; erneutes Laden hilft dagegen nicht.
      if (ursache instanceof WorkerFehler && ursache.status === 409) {
        throw new BehaelterVerweisFehler(ursache.message);
      }
      throw ursache;
    }
  }

  async loescheBehaelter(id: string): Promise<void> {
    try {
      await this.worker.anfragen(`/api/material/behaelter/${id}`, { method: 'DELETE' });
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 409) {
        throw new BehaelterInBenutzungFehler(id);
      }
      throw ursache;
    }
    this.puffer.verwerfen();
  }
}
