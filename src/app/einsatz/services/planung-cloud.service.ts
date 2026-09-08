import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import { Planung } from '../models/planung.model';
import { PepLadeErgebnis, lesePepDatei, serialisierePepDatei } from './pep-datei';

const BASISPFAD = '/api/nextcloud/planungen';
const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GespeichertePlanung {
  id: string;
  etag: string | null;
}
export interface CloudLadeErgebnis extends PepLadeErgebnis {
  etag: string | null;
}
interface BekannterStand {
  etag: string | null;
  inhalt: string;
}

function starkerEtag(wert: string | null): string | null {
  return wert && /^"[^"\r\n]*"$/.test(wert) ? wert : null;
}

function istDateiliste(wert: unknown): wert is { dateien: GespeichertePlanung[] } {
  if (
    typeof wert !== 'object' ||
    wert === null ||
    !('dateien' in wert) ||
    !Array.isArray(wert.dateien)
  )
    return false;
  return wert.dateien.every(
    (datei: unknown) =>
      typeof datei === 'object' &&
      datei !== null &&
      'id' in datei &&
      typeof datei.id === 'string' &&
      UUID_MUSTER.test(datei.id) &&
      'etag' in datei &&
      (datei.etag === null || typeof datei.etag === 'string'),
  );
}

@Injectable({ providedIn: 'root' })
export class PlanungCloudService {
  private readonly worker = inject(WorkerClient);
  private readonly bekannteStaende = new Map<string, BekannterStand>();
  readonly dateien = signal<GespeichertePlanung[]>([]);
  readonly namen = signal<Record<string, string>>({});
  readonly listeLaedt = signal(false);
  readonly listenFehler = signal('');

  async listeLaden(): Promise<void> {
    if (this.listeLaedt()) return;
    this.listeLaedt.set(true);
    this.listenFehler.set('');
    try {
      const antwort = await this.worker.json<unknown>(BASISPFAD);
      if (!istDateiliste(antwort))
        throw new Error('Der Server hat eine ungültige Liste der Einsatzpläne geliefert.');
      this.dateien.set(antwort.dateien);
    } catch (fehler) {
      this.listenFehler.set(this.fehlermeldung(fehler));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  async laden(id: string): Promise<CloudLadeErgebnis> {
    this.pruefeKennung(id);
    const antwort = await this.worker.anfragen(`${BASISPFAD}/${encodeURIComponent(id)}`);
    const ergebnis = lesePepDatei(await antwort.text());
    if (ergebnis.planung.id !== id)
      throw new Error(
        'Die Kennung in der Einsatzplandatei stimmt nicht mit dem Dateinamen überein.',
      );
    return { ...ergebnis, etag: starkerEtag(antwort.headers.get('ETag')) };
  }

  /** Erst nach bestätigter Übernahme als Grundlage für spätere Updates merken. */
  uebernahmeMerken(ergebnis: CloudLadeErgebnis): void {
    this.bekannteStaende.set(ergebnis.planung.id, {
      etag: starkerEtag(ergebnis.etag),
      inhalt: JSON.stringify(ergebnis.planung),
    });
    this.namen.update((namen) => ({ ...namen, [ergebnis.planung.id]: ergebnis.planung.name }));
  }

  hatLokaleAenderungen(planung: Planung): boolean {
    return this.bekannteStaende.get(planung.id)?.inhalt !== JSON.stringify(planung);
  }

  async speichern(planung: Planung): Promise<void> {
    this.pruefeKennung(planung.id);
    const inhalt = serialisierePepDatei(planung);
    const planungsstand = JSON.stringify(planung);
    const bekannterStand = this.bekannteStaende.get(planung.id);
    if (bekannterStand && !bekannterStand.etag) {
      throw new Error(
        'Für diesen Einsatzplan fehlt eine verlässlich vergleichbare Dateiversion (starker ETag). Bitte lokal als JSON sichern und den gespeicherten Plan erneut laden.',
      );
    }
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (bekannterStand?.etag) headers.set('If-Match', bekannterStand.etag);
    else headers.set('If-None-Match', '*');
    const antwort = await this.worker.anfragen(`${BASISPFAD}/${encodeURIComponent(planung.id)}`, {
      method: 'PUT',
      headers,
      body: inhalt,
    });
    const etag = starkerEtag(antwort.headers.get('ETag'));
    this.bekannteStaende.set(planung.id, { etag, inhalt: planungsstand });
    this.namen.update((namen) => ({ ...namen, [planung.id]: planung.name }));
    this.dateien.update((dateien) => [
      ...dateien.filter((datei) => datei.id !== planung.id),
      { id: planung.id, etag },
    ]);
  }

  fehlermeldung(fehler: unknown): string {
    return fehler instanceof Error
      ? fehler.message
      : 'Die Verbindung zu Nextcloud ist fehlgeschlagen.';
  }

  private pruefeKennung(id: string): void {
    if (!UUID_MUSTER.test(id))
      throw new Error(
        'Diese Planung hat keine gültige UUID. Bitte eine neue Planung erstellen und die Datei als Vorlage importieren.',
      );
  }
}
