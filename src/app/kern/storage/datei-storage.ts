/** Gemeinsamer Vertrag für dateibasierte Quellen beider Fachbereiche. */
export type StorageArt = 'lokale-datei' | 'nextcloud';

export interface DateiInhalt {
  daten: ArrayBuffer;
  dateiname: string;
}

export interface StorageFaehigkeiten {
  /** Schreibt ohne erneute Nutzerinteraktion an dieselbe Stelle zurück. */
  direktesSpeichern: boolean;
  /** Kann den aktuellen Stand vom Ziel neu einlesen. */
  neuLaden: boolean;
}

export interface DateiStorage {
  readonly art: StorageArt;
  readonly bezeichnung: string;
  readonly faehigkeiten: StorageFaehigkeiten;
  laden(): Promise<DateiInhalt>;
  speichern(daten: ArrayBuffer, dateiname: string): Promise<void>;
}

export class StorageFehler extends Error {
  constructor(
    message: string,
    readonly ursache?: unknown,
  ) {
    super(message);
    this.name = 'StorageFehler';
  }
}

/** Browser-Download für Excel-Arbeitsmappen und PEP-Dateien. */
export function dateiHerunterladen(daten: BlobPart, dateiname: string, medientyp: string): void {
  const url = URL.createObjectURL(new Blob([daten], { type: medientyp }));
  const verweis = document.createElement('a');
  verweis.href = url;
  verweis.download = dateiname;
  verweis.click();
  URL.revokeObjectURL(url);
}
