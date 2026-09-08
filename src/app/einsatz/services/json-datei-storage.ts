import {
  DateiInhalt,
  DateiStorage,
  StorageFehler,
  dateiHerunterladen,
} from '../../kern/storage/datei-storage';

/** JSON-Dateiquelle mit demselben binären Vertrag wie die Excel-Dateiquellen. */
export class JsonDateiStorage implements DateiStorage {
  readonly art = 'lokale-datei' as const;
  readonly bezeichnung: string;
  readonly faehigkeiten = { direktesSpeichern: false, neuLaden: false };

  constructor(private readonly datei: File) {
    this.bezeichnung = datei.name;
  }

  async laden(): Promise<DateiInhalt> {
    try {
      return { daten: await this.datei.arrayBuffer(), dateiname: this.datei.name };
    } catch (fehler) {
      throw new StorageFehler('Die Einsatzplanung konnte nicht gelesen werden.', fehler);
    }
  }

  async speichern(daten: ArrayBuffer, dateiname: string): Promise<void> {
    dateiHerunterladen(daten, dateiname, 'application/json');
  }
}
