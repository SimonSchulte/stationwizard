import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';

/**
 * Ablage der Word-Vorlage der Führerscheinliste am Worker
 * (`worker/src/fuehrerschein-vorlage.ts`): Metadaten lesen, die Datei laden
 * und im Verwaltungsbereich ersetzen. Das Füllen der Vorlage selbst steht in
 * `fuehrerschein-dokument.ts` – dieser Dienst kennt nur die Ablage, keine
 * Fachlogik.
 */
export interface FuehrerscheinVorlageMetadaten {
  vorhanden: boolean;
  dateiname: string | null;
  version: number | null;
  geaendertAm: string | null;
  geaendertVon: string | null;
}

const METADATEN_PFAD = '/api/personal/fuehrerschein-vorlage';
const DATEI_PFAD = '/api/personal/fuehrerschein-vorlage/datei';
export const FUEHRERSCHEIN_VORLAGE_MEDIENTYP =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istTextOderNull(wert: unknown): wert is string | null {
  return wert === null || typeof wert === 'string';
}

export function istFuehrerscheinVorlageMetadaten(
  wert: unknown,
): wert is FuehrerscheinVorlageMetadaten {
  return (
    istObjekt(wert) &&
    typeof wert['vorhanden'] === 'boolean' &&
    istTextOderNull(wert['dateiname']) &&
    (wert['version'] === null || typeof wert['version'] === 'number') &&
    istTextOderNull(wert['geaendertAm']) &&
    istTextOderNull(wert['geaendertVon'])
  );
}

@Injectable({ providedIn: 'root' })
export class FuehrerscheinVorlageService {
  private readonly worker = inject(WorkerClient);

  /** Version der zuletzt geladenen Metadaten, für ein nachfolgendes `hochladen()`. */
  private etag: string | null = null;

  async metadatenLaden(): Promise<FuehrerscheinVorlageMetadaten> {
    const antwort = await this.worker.anfragen(METADATEN_PFAD);
    const metadaten = await leseMetadatenAntwort(antwort);
    this.etag = antwort.headers.get('ETag');
    return metadaten;
  }

  /** Bewusst nur beim Erstellen des Dokuments abgerufen, nicht zwischengespeichert. */
  async datenLaden(): Promise<ArrayBuffer> {
    const antwort = await this.worker.anfragen(DATEI_PFAD, {
      headers: { Accept: FUEHRERSCHEIN_VORLAGE_MEDIENTYP },
      cache: 'no-store',
    });
    if (!antwort.headers.get('Content-Type')?.includes(FUEHRERSCHEIN_VORLAGE_MEDIENTYP)) {
      throw new WorkerFehler('Der Server hat keine gültige Vorlage geliefert.', 502);
    }
    return antwort.arrayBuffer();
  }

  /**
   * Legt ohne bekannte Version neu an (`If-None-Match: *`), sonst ersetzt sie
   * mit `If-Match` gegen die zuletzt über `metadatenLaden()` gelesene
   * Version – wie beim Excel-Rundlauf lieber ein 412-Konflikt als ein
   * unbemerktes Überschreiben.
   */
  async hochladen(datei: File): Promise<FuehrerscheinVorlageMetadaten> {
    const bedingung: Record<string, string> = this.etag
      ? { 'If-Match': this.etag }
      : { 'If-None-Match': '*' };
    const antwort = await this.worker.anfragen(METADATEN_PFAD, {
      method: 'PUT',
      headers: {
        'Content-Type': FUEHRERSCHEIN_VORLAGE_MEDIENTYP,
        'X-Stationwizard-Dateiname': datei.name,
        ...bedingung,
      },
      body: datei,
    });
    const metadaten = await leseMetadatenAntwort(antwort);
    this.etag = antwort.headers.get('ETag');
    return metadaten;
  }
}

async function leseMetadatenAntwort(antwort: Response): Promise<FuehrerscheinVorlageMetadaten> {
  if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
    throw new WorkerFehler('Der Server hat keine gültige API-Antwort geliefert.', 502);
  }
  let inhalt: unknown;
  try {
    inhalt = await antwort.json();
  } catch {
    throw new WorkerFehler('Die Serverantwort konnte nicht gelesen werden.', 502);
  }
  if (!istFuehrerscheinVorlageMetadaten(inhalt)) {
    throw new WorkerFehler('Der Server hat keine gültigen Metadaten geliefert.', 502);
  }
  return inhalt;
}
