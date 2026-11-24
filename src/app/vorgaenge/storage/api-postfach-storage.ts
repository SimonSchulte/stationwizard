import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import {
  PostfachAdressen,
  PostfachMail,
  istPostfachMail,
  lesePostfachAdressen,
} from '../models/postfach.model';

const PFAD = '/api/postfach';

/** Das Postfach am Worker; prüft jede Antwort, bevor sie an die Fachschicht geht. */
@Injectable({ providedIn: 'root' })
export class ApiPostfachStorage {
  private readonly worker = inject(WorkerClient);

  async mails(): Promise<{ mails: PostfachMail[]; aufbewahrungTage: number }> {
    const antwort = await this.worker.json<{ mails?: unknown; aufbewahrungTage?: unknown }>(
      `${PFAD}/mails`,
    );
    if (!Array.isArray(antwort.mails)) throw ungueltig();
    return {
      mails: antwort.mails.filter(istPostfachMail),
      aufbewahrungTage:
        typeof antwort.aufbewahrungTage === 'number' ? antwort.aufbewahrungTage : 30,
    };
  }

  async adressen(): Promise<PostfachAdressen> {
    const antwort = lesePostfachAdressen(await this.worker.json<unknown>(`${PFAD}/adressen`));
    if (!antwort) throw ungueltig();
    return antwort;
  }

  /** Die Rohmail; nur für die Vorschau im Browser, nicht zwischengespeichert. */
  async rohmail(id: string): Promise<ArrayBuffer> {
    const antwort = await this.worker.anfragen(`${PFAD}/mails/${encodeURIComponent(id)}/datei`, {
      cache: 'no-store',
    });
    return await antwort.arrayBuffer();
  }

  async verwerfen(id: string): Promise<void> {
    await this.worker.json<unknown>(`${PFAD}/mails/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async ordneZu(id: string, vorgangId: string): Promise<void> {
    await this.worker.json<unknown>(`${PFAD}/mails/${encodeURIComponent(id)}/zuordnung`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vorgangId }),
    });
  }

  async setzeKuerzel(fahrzeugId: string, kuerzel: string): Promise<void> {
    await this.worker.json<unknown>(`${PFAD}/adressen/${encodeURIComponent(fahrzeugId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kuerzel }),
    });
  }
}

function ungueltig(): WorkerFehler {
  return new WorkerFehler('Der Server hat keine gültige Antwort zum Postfach geliefert.', 502);
}
