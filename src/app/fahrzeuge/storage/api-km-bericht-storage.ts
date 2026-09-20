import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { KmBericht, VersandQuittung } from '../models/km-bericht.model';
import { istKmBericht, istVersandQuittung } from '../services/km-bericht-pruefung';
import { FahrzeugAbrufPuffer } from './fahrzeug-abruf-puffer';
import { KmBerichtStorage, VersandNichtMoeglichFehler } from './km-bericht-storage';

const BERICHT_PFAD = '/api/fahrzeuge/km-bericht';

/**
 * Adapter gegen die Worker-Routen des Kilometerstandsberichts. Übersetzt
 * zwischen Worker-JSON und Domänentyp an genau dieser Stelle.
 */
@Injectable({ providedIn: 'root' })
export class ApiKmBerichtStorage implements KmBerichtStorage {
  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(FahrzeugAbrufPuffer);

  async ladeBericht(): Promise<KmBericht> {
    return this.puffer.bericht.hole('aktuell', async () => {
      const antwort = await this.worker.json<unknown>(BERICHT_PFAD);
      if (!istKmBericht(antwort)) {
        throw new WorkerFehler('Der Server hat einen ungültigen Bericht geliefert.', 502);
      }
      return antwort;
    });
  }

  async sendeBericht(): Promise<VersandQuittung> {
    try {
      const antwort = await this.worker.json<unknown>(`${BERICHT_PFAD}/senden`, {
        method: 'POST',
      });
      if (!istVersandQuittung(antwort)) {
        throw new WorkerFehler('Der Server hat den Versand nicht bestätigt.', 502);
      }
      return antwort;
    } catch (ursache) {
      // 409 (kein Empfänger) und 503 (Versandweg nicht eingerichtet) sind
      // offene Einstellungen, keine Störung – die Oberfläche soll dafür auf
      // die Systemkonfiguration zeigen statt einen Serverfehler zu melden.
      if (ursache instanceof WorkerFehler && (ursache.status === 409 || ursache.status === 503)) {
        throw new VersandNichtMoeglichFehler(
          ursache.status === 409
            ? 'Es ist keine Empfängeradresse hinterlegt.'
            : 'Der gewählte Versandweg ist am Worker nicht eingerichtet.',
        );
      }
      throw ursache;
    }
  }
}
