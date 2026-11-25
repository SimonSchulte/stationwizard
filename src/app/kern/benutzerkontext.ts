import { Injectable, computed, inject, signal } from '@angular/core';
import { Namensverzeichnis } from './namensverzeichnis';
import { WorkerClient } from './worker-client';
import { anzeigenameAusEmail, initialenAusAnzeigename } from './text/anzeigename';

/** Zeigt ausschließlich die vom Worker geprüfte Access-Identität an. */
@Injectable({ providedIn: 'root' })
export class Benutzerkontext {
  private readonly worker = inject(WorkerClient);
  private readonly namen = inject(Namensverzeichnis);
  readonly email = signal('');
  readonly laedt = signal(false);
  readonly fehler = signal('');
  /** Der selbst gewählte Anzeigename aus den Benutzereinstellungen, sonst `null`. */
  readonly eigenerName = signal<string | null>(null);
  /**
   * Der eigene Name aus den Benutzereinstellungen; ohne ihn aus der geprüften E-Mail-Adresse
   * abgeleitet (kein echter Google-Name, das Access-JWT trägt keinen).
   */
  readonly anzeigename = computed(() => this.eigenerName() ?? anzeigenameAusEmail(this.email()));
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
      const benutzer = await this.worker.json<{ email?: unknown; anzeigename?: unknown }>(
        '/api/benutzer',
      );
      if (typeof benutzer.email !== 'string' || !benutzer.email.includes('@')) {
        throw new Error('Die Benutzerinformation ist unvollständig. Bitte erneut anmelden.');
      }
      this.email.set(benutzer.email);
      this.eigenerName.set(
        typeof benutzer.anzeigename === 'string' && benutzer.anzeigename.trim()
          ? benutzer.anzeigename
          : null,
      );
      void this.namen.laden();
      await this.profilbildLaden();
    } catch (ursache) {
      this.email.set('');
      this.eigenerName.set(null);
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

  /**
   * Speichert den eigenen Anzeigenamen (`null` setzt auf den abgeleiteten zurück) und gilt ab
   * sofort für die ganze Oberfläche. Wirft bei einem Fehler, damit die Seite ihn melden kann.
   */
  async anzeigenameSetzen(name: string | null): Promise<void> {
    const antwort = await this.worker.json<{ anzeigename?: unknown }>('/api/benutzer/anzeigename', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anzeigename: name }),
    });
    const gespeichert =
      typeof antwort.anzeigename === 'string' && antwort.anzeigename ? antwort.anzeigename : null;
    this.eigenerName.set(gespeichert);
    this.namen.vermerke(this.email(), gespeichert);
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
