import { inject, Injectable } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Ablesungseinreichung } from '../models/fahrzeug.model';
import { istAblesungseinreichung } from '../services/fahrzeug-pruefung';
import {
  EinreichungNichtOffenFehler,
  EinreichungStorage,
  FreigabeVerweigertFehler,
} from './einreichung-storage';

interface EinreichungListenAntwort {
  einreichungen: unknown[];
}

const BASIS = '/api/fahrzeuge/einreichungen';

/**
 * Adapter gegen `/api/fahrzeuge/einreichungen`. Übersetzt die beiden
 * fachlichen Fehlerfälle an genau dieser Stelle in eigene Klassen; die
 * Fachschicht sieht nur `EinreichungStorage`.
 */
@Injectable({ providedIn: 'root' })
export class ApiEinreichungStorage implements EinreichungStorage {
  private readonly worker = inject(WorkerClient);

  async ladeOffene(): Promise<Ablesungseinreichung[]> {
    const antwort = await this.worker.json<EinreichungListenAntwort>(BASIS);
    return antwort.einreichungen.filter(istAblesungseinreichung);
  }

  async freigeben(einreichungId: string): Promise<void> {
    await this.entscheide(`${BASIS}/${einreichungId}/freigabe`, {});
  }

  async ablehnen(einreichungId: string, grund: string): Promise<void> {
    await this.entscheide(`${BASIS}/${einreichungId}/ablehnung`, { grund });
  }

  private async entscheide(pfad: string, koerper: unknown): Promise<void> {
    try {
      await this.worker.anfragen(pfad, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      });
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 403) {
        throw new FreigabeVerweigertFehler(
          'Diese Meldung darf nur die Zugführung oder die Gruppenführung des Fahrzeugs entscheiden.',
        );
      }
      if (ursache instanceof WorkerFehler && ursache.status === 409) {
        throw new EinreichungNichtOffenFehler(
          'Diese Meldung wurde zwischenzeitlich schon entschieden.',
        );
      }
      throw ursache;
    }
  }
}
