import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import {
  CheckEinreichung,
  CheckEinreichungDetail,
  FreigabeAntwort,
} from '../models/einreichung.model';
import { istCheckEinreichung, istCheckEinreichungDetail } from '../services/einreichung-pruefung';
import { EinreichungNichtOffenFehler, EinreichungStorage } from './einreichung-storage';
import { MaterialAbrufPuffer } from './material-abruf-puffer';

const PFAD = '/api/material/einreichungen';

@Injectable({ providedIn: 'root' })
export class ApiEinreichungStorage implements EinreichungStorage {
  readonly bezeichnung = 'Check-Einreichungen (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(MaterialAbrufPuffer);

  async ladeOffene(): Promise<CheckEinreichung[]> {
    const antwort = await this.worker.json<{ einreichungen: unknown[] }>(PFAD);
    return antwort.einreichungen.filter(istCheckEinreichung);
  }

  async ladeEinreichung(id: string): Promise<CheckEinreichungDetail | null> {
    try {
      const inhalt = await this.worker.json<unknown>(`${PFAD}/${id}`);
      if (!istCheckEinreichungDetail(inhalt)) {
        throw new WorkerFehler('Der Server hat eine ungültige Meldung geliefert.', 502);
      }
      return inhalt;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
      throw ursache;
    }
  }

  async gibFrei(ids: readonly string[]): Promise<FreigabeAntwort[]> {
    const antwort = await this.worker.json<{ ergebnisse: FreigabeAntwort[] }>(`${PFAD}/freigabe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    // Eine Freigabe erzeugt Checks und verändert damit auch die Behälterübersicht.
    this.puffer.verwerfen();
    return antwort.ergebnisse;
  }

  async lehneAb(id: string, grund: string): Promise<void> {
    try {
      await this.worker.anfragen(`${PFAD}/${id}/ablehnung`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grund }),
      });
    } catch (ursache) {
      // 409 hat an diesem Endpunkt genau eine Ursache.
      if (ursache instanceof WorkerFehler && ursache.status === 409) {
        throw new EinreichungNichtOffenFehler();
      }
      throw ursache;
    }
  }
}
