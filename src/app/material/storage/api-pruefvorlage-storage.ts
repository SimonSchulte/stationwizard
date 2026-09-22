import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Pruefvorlage, PruefvorlageKopf } from '../models/pruefvorlage.model';
import { istPruefvorlage, istPruefvorlageKopf } from '../services/material-pruefung';
import { MaterialAbrufPuffer } from './material-abruf-puffer';
import {
  PruefvorlageMitVersion,
  PruefvorlageStorage,
  VorlageInBenutzungFehler,
  VorlageKonfliktFehler,
} from './pruefvorlage-storage';

interface VorlagenListenAntwort {
  vorlagen: unknown[];
}

/**
 * Adapter gegen `/api/material/vorlagen`. Übersetzt zwischen Worker-JSON und
 * Domänentypen an genau dieser Stelle – die Fachschicht sieht nur
 * `PruefvorlageStorage`. Mirrors `api-angebot-storage.ts`.
 */
@Injectable({ providedIn: 'root' })
export class ApiPruefvorlageStorage implements PruefvorlageStorage {
  readonly bezeichnung = 'Prüfvorlagen (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(MaterialAbrufPuffer);

  async ladeKoepfe(): Promise<PruefvorlageKopf[]> {
    return this.puffer.vorlagen.hole('alle', async () => {
      const antwort = await this.worker.json<VorlagenListenAntwort>('/api/material/vorlagen');
      return antwort.vorlagen.filter(istPruefvorlageKopf);
    });
  }

  async ladeVorlage(id: string): Promise<PruefvorlageMitVersion | null> {
    try {
      const antwort = await this.worker.anfragen(`/api/material/vorlagen/${id}`);
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
      if (!istPruefvorlage(inhalt) || !version) {
        throw new WorkerFehler('Der Server hat eine ungültige Prüfvorlage geliefert.', 502);
      }
      return { daten: inhalt, version };
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
      throw ursache;
    }
  }

  async speichereVorlage(vorlage: Pruefvorlage, version: string | null): Promise<string> {
    const pfad =
      version === null ? '/api/material/vorlagen' : `/api/material/vorlagen/${vorlage.id}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (version === null) headers.set('If-None-Match', '*');
    else headers.set('If-Match', version);
    try {
      const antwort = await this.worker.anfragen(pfad, {
        method: version === null ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(vorlage),
      });
      const neueVersion = antwort.headers.get('ETag');
      if (!neueVersion) {
        throw new WorkerFehler('Der Server hat keine gültige Version geliefert.', 502);
      }
      this.puffer.verwerfen();
      return neueVersion;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 412) {
        throw new VorlageKonfliktFehler(vorlage.id);
      }
      throw ursache;
    }
  }

  async loescheVorlage(id: string): Promise<void> {
    try {
      await this.worker.anfragen(`/api/material/vorlagen/${id}`, { method: 'DELETE' });
    } catch (ursache) {
      // An diesem Endpunkt hat 409 genau eine Ursache: die Vorlage ist noch in
      // Benutzung. Ein Blick auf den Diagnosecode erübrigt sich dadurch.
      if (ursache instanceof WorkerFehler && ursache.status === 409) {
        throw new VorlageInBenutzungFehler(id);
      }
      throw ursache;
    }
    this.puffer.verwerfen();
  }
}
