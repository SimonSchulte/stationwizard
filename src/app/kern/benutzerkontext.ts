import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient } from './worker-client';

/** Zeigt ausschließlich die vom Worker geprüfte Access-Identität an. */
@Injectable({ providedIn: 'root' })
export class Benutzerkontext {
  private readonly worker = inject(WorkerClient);
  readonly email = signal('');
  readonly laedt = signal(false);
  readonly fehler = signal('');

  async laden(): Promise<void> {
    if (this.laedt()) return;
    this.laedt.set(true);
    this.fehler.set('');
    try {
      const benutzer = await this.worker.json<{ email?: unknown }>('/api/benutzer');
      if (typeof benutzer.email !== 'string' || !benutzer.email.includes('@')) {
        throw new Error('Die Benutzerinformation ist unvollständig. Bitte erneut anmelden.');
      }
      this.email.set(benutzer.email);
    } catch (ursache) {
      this.email.set('');
      this.fehler.set(
        ursache instanceof Error
          ? ursache.message
          : 'Benutzerinformation konnte nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }
}
