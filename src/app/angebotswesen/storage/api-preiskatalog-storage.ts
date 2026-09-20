import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { PreiskatalogEintrag } from '../models/preiskatalog.model';
import { istPreiskatalogEintrag } from '../services/preiskatalog-pruefung';
import { PreiskatalogAbrufPuffer } from './preiskatalog-abruf-puffer';
import {
  PreiskatalogEintragEingabe,
  PreiskatalogKonfliktFehler,
  PreiskatalogStorage,
} from './preiskatalog-storage';

interface PreiskatalogListenAntwort {
  eintraege: unknown[];
}

/**
 * Adapter gegen `/api/angebotswesen/preiskatalog`. Übersetzt zwischen der
 * Worker-JSON-Form und den Domänentypen an genau dieser Stelle – die
 * Fachschicht sieht nur `PreiskatalogStorage`. Anders als beim Fahrzeugmodul
 * liegt die Version direkt im JSON-Feld jeder Zeile statt nur im ETag einer
 * Einzelabfrage (siehe `preiskatalog.model.ts`).
 */
@Injectable({ providedIn: 'root' })
export class ApiPreiskatalogStorage implements PreiskatalogStorage {
  readonly bezeichnung = 'Preiskatalog (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(PreiskatalogAbrufPuffer);

  async ladeEintraege(): Promise<PreiskatalogEintrag[]> {
    return this.puffer.liste.hole('alle', async () => {
      const antwort = await this.worker.json<PreiskatalogListenAntwort>(
        '/api/angebotswesen/preiskatalog',
      );
      return antwort.eintraege.filter(istPreiskatalogEintrag);
    });
  }

  async speichereEintrag(
    eintrag: PreiskatalogEintragEingabe,
    version: number | null,
  ): Promise<PreiskatalogEintrag> {
    const pfad =
      version === null
        ? '/api/angebotswesen/preiskatalog'
        : `/api/angebotswesen/preiskatalog/${eintrag.id}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (version === null) headers.set('If-None-Match', '*');
    else headers.set('If-Match', `"${version}"`);
    try {
      const antwort = await this.worker.json<unknown>(pfad, {
        method: version === null ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(eintrag),
      });
      if (!istPreiskatalogEintrag(antwort)) {
        throw new WorkerFehler(
          'Der Server hat einen ungültigen Preiskatalog-Eintrag geliefert.',
          502,
        );
      }
      this.puffer.verwerfen();
      return antwort;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 412) {
        throw new PreiskatalogKonfliktFehler(eintrag.id);
      }
      throw ursache;
    }
  }

  async loescheEintrag(id: string): Promise<void> {
    await this.worker.anfragen(`/api/angebotswesen/preiskatalog/${id}`, { method: 'DELETE' });
    this.puffer.verwerfen();
  }
}
