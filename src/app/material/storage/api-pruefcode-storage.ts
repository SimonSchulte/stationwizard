import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';

/**
 * Zugriff auf die Prüfcodes des öffentlichen QR-Wegs.
 *
 * Bewusst ein eigener, sehr kleiner Adapter ohne Puffer: das Token ist ein
 * Geheimnis und wird nur beim ausdrücklichen Öffnen der QR-Ansicht geholt,
 * nicht nebenbei mit der Behälterliste.
 */
export interface Pruefcode {
  behaelterId: string;
  token: string | null;
  tokenAm: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiPruefcodeStorage {
  private readonly worker = inject(WorkerClient);

  async lesePruefcode(behaelterId: string): Promise<Pruefcode> {
    return this.worker.json<Pruefcode>(`/api/material/behaelter/${behaelterId}/pruefcode`);
  }

  /** Erneuert das Token; gedruckte Aufkleber dieses Behälters werden sofort ungültig. */
  async erneuerePruefcode(behaelterId: string): Promise<Pruefcode> {
    const antwort = await this.worker.anfragen(`/api/material/behaelter/${behaelterId}/pruefcode`, {
      method: 'POST',
    });
    if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
      throw new WorkerFehler('Der Server hat keine gültige API-Antwort geliefert.', 502);
    }
    return (await antwort.json()) as Pruefcode;
  }
}
