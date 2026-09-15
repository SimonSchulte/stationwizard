import { Injectable, computed, inject, signal } from '@angular/core';
import { WorkerClient } from './worker-client';
import { anzeigenameAusEmail, initialenAusAnzeigename } from './text/anzeigename';

/** Zeigt ausschließlich die vom Worker geprüfte Access-Identität an. */
@Injectable({ providedIn: 'root' })
export class Benutzerkontext {
  private readonly worker = inject(WorkerClient);
  readonly email = signal('');
  readonly laedt = signal(false);
  readonly fehler = signal('');
  /** Aus der geprüften E-Mail-Adresse abgeleitet; kein echter Google-Name. */
  readonly anzeigename = computed(() => anzeigenameAusEmail(this.email()));
  readonly initialen = computed(() => initialenAusAnzeigename(this.anzeigename()));
  /**
   * Best-effort-Google-Profilbild über `/api/benutzer/profilbild`; `null`,
   * solange keins vorliegt oder der Abruf fehlschlägt. Wie genau der Worker
   * daran kommt (`worker/src/profilbild.ts`), bleibt bewusst hier unbekannt.
   */
  readonly profilbildUrl = signal<string | null>(null);

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
      await this.profilbildLaden();
    } catch (ursache) {
      this.email.set('');
      this.profilbildUrl.set(null);
      this.fehler.set(
        ursache instanceof Error
          ? ursache.message
          : 'Benutzerinformation konnte nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  /** Eigener Abruf mit eigenem Fehlerfang: ein fehlendes Bild darf die Anmeldung nie scheitern lassen. */
  private async profilbildLaden(): Promise<void> {
    try {
      const antwort = await this.worker.json<{ profilbildUrl?: unknown }>(
        '/api/benutzer/profilbild',
      );
      this.profilbildUrl.set(
        typeof antwort.profilbildUrl === 'string' ? antwort.profilbildUrl : null,
      );
    } catch {
      this.profilbildUrl.set(null);
    }
  }
}
