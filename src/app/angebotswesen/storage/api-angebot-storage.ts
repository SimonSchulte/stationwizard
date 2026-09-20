import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Angebot } from '../models/angebot.model';
import { istAngebot } from '../services/angebot-pruefung';
import { AngebotAbrufPuffer } from './angebot-abruf-puffer';
import { AngebotKonfliktFehler, AngebotMitVersion, AngebotStorage } from './angebot-storage';

interface AngebotListenAntwort {
  angebote: unknown[];
}

/**
 * Adapter gegen `/api/angebotswesen/angebote`. Übersetzt zwischen der
 * Worker-JSON-Form und den Domänentypen an genau dieser Stelle – die
 * Fachschicht sieht nur `AngebotStorage`. Mirrors `api-fahrzeug-storage.ts`.
 */
@Injectable({ providedIn: 'root' })
export class ApiAngebotStorage implements AngebotStorage {
  readonly bezeichnung = 'Angebotsverwaltung (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(AngebotAbrufPuffer);

  async ladeAngebote(): Promise<Angebot[]> {
    return this.puffer.liste.hole('alle', async () => {
      const antwort = await this.worker.json<AngebotListenAntwort>('/api/angebotswesen/angebote');
      return antwort.angebote.filter(istAngebot);
    });
  }

  async ladeAngebot(id: string): Promise<AngebotMitVersion | null> {
    try {
      const antwort = await this.worker.anfragen(`/api/angebotswesen/angebote/${id}`);
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
      if (!istAngebot(inhalt) || !version) {
        throw new WorkerFehler('Der Server hat ein ungültiges Angebot geliefert.', 502);
      }
      return { daten: inhalt, version };
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
      throw ursache;
    }
  }

  async speichereAngebot(angebot: Angebot, version: string | null): Promise<string> {
    const pfad =
      version === null
        ? '/api/angebotswesen/angebote'
        : `/api/angebotswesen/angebote/${angebot.id}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (version === null) headers.set('If-None-Match', '*');
    else headers.set('If-Match', version);
    try {
      const antwort = await this.worker.anfragen(pfad, {
        method: version === null ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(angebot),
      });
      const neueVersion = antwort.headers.get('ETag');
      if (!neueVersion) {
        throw new WorkerFehler('Der Server hat keine gültige Version geliefert.', 502);
      }
      this.puffer.verwerfen();
      return neueVersion;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 412) {
        throw new AngebotKonfliktFehler(angebot.id);
      }
      throw ursache;
    }
  }

  async loescheAngebot(id: string): Promise<void> {
    await this.worker.anfragen(`/api/angebotswesen/angebote/${id}`, { method: 'DELETE' });
    this.puffer.verwerfen();
  }
}
