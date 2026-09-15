import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Einstellungen, Systemkonfiguration } from '../models/systemkonfiguration.model';
import { istSystemkonfiguration } from '../services/systemkonfiguration-pruefung';
import { SystemkonfigurationStorage } from './systemkonfiguration-storage';

const PFAD = '/api/systemkonfiguration';

/** Adapter gegen die Worker-Route `/api/systemkonfiguration`. */
@Injectable({ providedIn: 'root' })
export class ApiSystemkonfigurationStorage implements SystemkonfigurationStorage {
  private readonly worker = inject(WorkerClient);

  async laden(): Promise<Systemkonfiguration> {
    return this.pruefe(await this.worker.json<unknown>(PFAD));
  }

  async speichern(einstellungen: Einstellungen): Promise<Systemkonfiguration> {
    return this.pruefe(
      await this.worker.json<unknown>(PFAD, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(einstellungen),
      }),
    );
  }

  private pruefe(antwort: unknown): Systemkonfiguration {
    if (!istSystemkonfiguration(antwort)) {
      throw new WorkerFehler('Der Server hat eine ungültige Systemkonfiguration geliefert.', 502);
    }
    return antwort;
  }
}
