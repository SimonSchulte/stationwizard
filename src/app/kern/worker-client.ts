import { Injectable, signal } from '@angular/core';

export type Verbindungszustand =
  'ungeprueft' | 'erreichbar' | 'nicht-erreichbar' | 'sitzung-abgelaufen';

export class WorkerFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'WorkerFehler';
  }
}

/** Gemeinsamer Client: ausschließlich API-Pfade derselben Origin, keine Zugangsdaten. */
@Injectable({ providedIn: 'root' })
export class WorkerClient {
  readonly zustand = signal<Verbindungszustand>('ungeprueft');
  readonly laufendeAnfragen = signal(0);
  readonly fehler = signal('');

  async anfragen(pfad: string, optionen: RequestInit = {}): Promise<Response> {
    if (!pfad.startsWith('/api/') || pfad.includes('\\')) {
      throw new WorkerFehler('Ungültiger API-Pfad.', 0);
    }
    this.laufendeAnfragen.update((anzahl) => anzahl + 1);
    const headers = new Headers(optionen.headers);
    headers.set('X-Requested-With', 'XMLHttpRequest');
    try {
      const antwort = await fetch(pfad, {
        ...optionen,
        headers,
        credentials: 'same-origin',
        redirect: 'error',
        signal: optionen.signal ?? AbortSignal.timeout(30_000),
      });
      if (antwort.status === 401 || antwort.status === 403) {
        this.zustand.set('sitzung-abgelaufen');
        throw new WorkerFehler(
          'Die Sitzung ist abgelaufen oder der Zugriff wurde verweigert. Bitte erneut anmelden.',
          antwort.status,
        );
      }
      this.zustand.set('erreichbar');
      if (!antwort.ok) {
        const meldung =
          antwort.status === 412
            ? 'Die Datei wurde zwischenzeitlich geändert. Bitte zuerst eine lokale Kopie herunterladen, dann neu laden und die Änderungen zusammenführen.'
            : antwort.status === 503
              ? 'Die Verbindung ist noch nicht vollständig eingerichtet.'
              : `Die Anfrage konnte nicht ausgeführt werden (HTTP ${antwort.status}).`;
        throw new WorkerFehler(meldung, antwort.status);
      }
      this.fehler.set('');
      return antwort;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler) {
        this.fehler.set(ursache.message);
        throw ursache;
      }
      this.zustand.set('nicht-erreichbar');
      const fehler = new WorkerFehler(
        'Der Server ist nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.',
        0,
      );
      this.fehler.set(fehler.message);
      throw fehler;
    } finally {
      this.laufendeAnfragen.update((anzahl) => anzahl - 1);
    }
  }

  async json<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
    const antwort = await this.anfragen(pfad, optionen);
    if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
      throw new WorkerFehler('Der Server hat keine gültige API-Antwort geliefert.', 502);
    }
    try {
      return (await antwort.json()) as T;
    } catch {
      throw new WorkerFehler('Die Serverantwort konnte nicht gelesen werden.', 502);
    }
  }
}
