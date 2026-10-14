import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';

/**
 * Ablage einer hinterlegten Dokumentvorlage am Worker (`worker/src/datei-vorlage.ts`):
 * Metadaten lesen, die Datei laden und im Verwaltungsbereich ersetzen. Zwei Arten: die
 * Word-Vorlage der Führerscheinliste (gefüllt in `fuehrerschein-dokument.ts`) und das PDF-Formular
 * des Ehrungsantrags (gefüllt in `ehrungsantrag-pdf.ts`). Die Dienste kennen nur die Ablage, keine
 * Fachlogik.
 */
export interface DateiVorlageMetadaten {
  vorhanden: boolean;
  dateiname: string | null;
  version: number | null;
  geaendertAm: string | null;
  geaendertVon: string | null;
}

/** Bisheriger Name, für die Führerscheinliste unverändert. */
export type FuehrerscheinVorlageMetadaten = DateiVorlageMetadaten;

export const FUEHRERSCHEIN_VORLAGE_MEDIENTYP =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istTextOderNull(wert: unknown): wert is string | null {
  return wert === null || typeof wert === 'string';
}

export function istDateiVorlageMetadaten(wert: unknown): wert is DateiVorlageMetadaten {
  return (
    istObjekt(wert) &&
    typeof wert['vorhanden'] === 'boolean' &&
    istTextOderNull(wert['dateiname']) &&
    (wert['version'] === null || typeof wert['version'] === 'number') &&
    istTextOderNull(wert['geaendertAm']) &&
    istTextOderNull(wert['geaendertVon'])
  );
}

/** Gemeinsame Ablage; die Art steckt allein in Pfaden und Medientyp. */
export abstract class DateiVorlageDienst {
  private readonly worker = inject(WorkerClient);

  constructor(
    private readonly metadatenPfad: string,
    private readonly dateiPfad: string,
    readonly medientyp: string,
  ) {}

  /** Version der zuletzt geladenen Metadaten, für ein nachfolgendes `hochladen()`. */
  private etag: string | null = null;

  async metadatenLaden(): Promise<DateiVorlageMetadaten> {
    const antwort = await this.worker.anfragen(this.metadatenPfad);
    const metadaten = await leseMetadatenAntwort(antwort);
    this.etag = antwort.headers.get('ETag');
    return metadaten;
  }

  /** Bewusst nur beim Erstellen des Dokuments abgerufen, nicht zwischengespeichert. */
  async datenLaden(): Promise<ArrayBuffer> {
    const antwort = await this.worker.anfragen(this.dateiPfad, {
      headers: { Accept: this.medientyp },
      cache: 'no-store',
    });
    if (!antwort.headers.get('Content-Type')?.includes(this.medientyp)) {
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
  async hochladen(datei: File): Promise<DateiVorlageMetadaten> {
    const bedingung: Record<string, string> = this.etag
      ? { 'If-Match': this.etag }
      : { 'If-None-Match': '*' };
    const antwort = await this.worker.anfragen(this.metadatenPfad, {
      method: 'PUT',
      headers: {
        'Content-Type': this.medientyp,
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

async function leseMetadatenAntwort(antwort: Response): Promise<DateiVorlageMetadaten> {
  if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
    throw new WorkerFehler('Der Server hat keine gültige API-Antwort geliefert.', 502);
  }
  let inhalt: unknown;
  try {
    inhalt = await antwort.json();
  } catch {
    throw new WorkerFehler('Die Serverantwort konnte nicht gelesen werden.', 502);
  }
  if (!istDateiVorlageMetadaten(inhalt)) {
    throw new WorkerFehler('Der Server hat keine gültigen Metadaten geliefert.', 502);
  }
  return inhalt;
}

@Injectable({ providedIn: 'root' })
export class FuehrerscheinVorlageService extends DateiVorlageDienst {
  constructor() {
    super(
      '/api/personal/fuehrerschein-vorlage',
      '/api/personal/fuehrerschein-vorlage/datei',
      FUEHRERSCHEIN_VORLAGE_MEDIENTYP,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class EhrungsantragVorlageService extends DateiVorlageDienst {
  constructor() {
    super(
      '/api/personal/ehrungsantrag-vorlage',
      '/api/personal/ehrungsantrag-vorlage/datei',
      'application/pdf',
    );
  }
}
