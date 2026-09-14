import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Benutzerkonto, Hauptrolle, Sonderrolle } from '../models/benutzerkonto.model';
import { istBenutzerkonto } from '../services/benutzerverwaltung-pruefung';
import {
  BenutzerNichtGefundenFehler,
  BenutzerverwaltungStorage,
} from './benutzerverwaltung-storage';

interface BenutzerListenAntwort {
  benutzer: unknown[];
}

/**
 * Adapter gegen die Worker-Route `/api/benutzerverwaltung`. Übersetzt
 * zwischen der Worker-JSON-Form und den Domänentypen an genau dieser Stelle;
 * die Fachschicht sieht nur `BenutzerverwaltungStorage`.
 */
@Injectable({ providedIn: 'root' })
export class ApiBenutzerverwaltungStorage implements BenutzerverwaltungStorage {
  private readonly worker = inject(WorkerClient);

  async ladeBenutzer(): Promise<Benutzerkonto[]> {
    const antwort = await this.worker.json<BenutzerListenAntwort>('/api/benutzerverwaltung');
    return antwort.benutzer.filter(istBenutzerkonto);
  }

  async rolleSetzen(
    email: string,
    rolle: Hauptrolle | null,
    sonderrollen: Sonderrolle[],
  ): Promise<Benutzerkonto> {
    try {
      const antwort = await this.worker.json<unknown>(
        `/api/benutzerverwaltung/${encodeURIComponent(email)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rolle, sonderrollen }),
        },
      );
      if (!istBenutzerkonto(antwort)) {
        throw new WorkerFehler('Der Server hat ein ungültiges Benutzerkonto geliefert.', 502);
      }
      return antwort;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) {
        throw new BenutzerNichtGefundenFehler(email);
      }
      throw ursache;
    }
  }
}
