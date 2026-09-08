import { WorkerClient } from '../../kern/worker-client';
import {
  StorageFaehigkeiten,
  StorageFehler,
  WorkbookInhalt,
  WorkbookStorage,
} from './workbook-storage';

const ARBEITSMAPPEN_PFAD = '/api/nextcloud/arbeitsmappe';
const ARBEITSMAPPEN_TYP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Zentrale Arbeitsmappe; sämtliche NextCloud-Zugangsdaten bleiben im Worker. */
export class NextcloudWorkerStorage implements WorkbookStorage {
  readonly art = 'nextcloud' as const;
  readonly faehigkeiten: StorageFaehigkeiten = { direktesSpeichern: true, neuLaden: true };

  private etag: string | null = null;
  private dateiname = 'Rahmenplan.xlsx';

  constructor(private readonly worker: WorkerClient) {}

  get bezeichnung(): string {
    return `NextCloud · ${this.dateiname}`;
  }

  async laden(): Promise<WorkbookInhalt> {
    const antwort = await this.worker.anfragen(ARBEITSMAPPEN_PFAD, {
      method: 'GET',
      headers: { Accept: ARBEITSMAPPEN_TYP },
      cache: 'no-store',
    });
    if (!antwort.headers.get('Content-Type')?.includes(ARBEITSMAPPEN_TYP)) {
      throw new StorageFehler('Der Server hat keine Excel-Arbeitsmappe geliefert.');
    }
    const daten = await antwort.arrayBuffer();
    this.etag = starkesEtag(antwort.headers.get('ETag'));
    this.dateiname = leseDateiname(antwort.headers.get('Content-Disposition'));
    return { daten, dateiname: this.dateiname };
  }

  async speichern(daten: ArrayBuffer): Promise<void> {
    if (!this.etag) {
      throw new StorageFehler(
        'Die Arbeitsmappe hat keinen gültigen Änderungsstand. Bitte zuerst neu laden. ' +
          'Bleibt der Fehler bestehen, muss die NextCloud-Verbindung geprüft werden.',
      );
    }
    const etag = this.etag;
    // Nach einem Verbindungsabbruch ist unbekannt, ob NextCloud bereits gespeichert
    // hat. Ein weiterer Schreibversuch benötigt deshalb einen neu geladenen Stand.
    this.etag = null;
    const antwort = await this.worker.anfragen(ARBEITSMAPPEN_PFAD, {
      method: 'PUT',
      headers: { 'Content-Type': ARBEITSMAPPEN_TYP, 'If-Match': etag },
      body: daten,
    });
    this.etag = starkesEtag(antwort.headers.get('ETag'));
  }
}

/** If-Match benötigt einen starken Validator, keine schwache W/-Kennung. */
function starkesEtag(wert: string | null): string | null {
  return wert && /^"[^"\r\n]+"$/.test(wert) ? wert : null;
}

function leseDateiname(disposition: string | null): string {
  const erweitert = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '');
  const einfach = /filename="([^"\r\n]+)"/i.exec(disposition ?? '');
  let dateiname = einfach?.[1] ?? '';
  if (erweitert) {
    try {
      dateiname = decodeURIComponent(erweitert[1]);
    } catch {
      // Bei ungültiger Kodierung bleibt der einfache Dateiname bzw. die Vorgabe.
    }
  }
  const blattname = dateiname.split(/[\\/]/).pop()?.trim() ?? '';
  return /^[^\r\n]+\.xlsx$/i.test(blattname) ? blattname : 'Rahmenplan.xlsx';
}
