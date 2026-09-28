import {
  CheckEinreichung,
  CheckEinreichungDetail,
  FreigabeAntwort,
} from '../models/einreichung.model';

/** Vertrag für die Freigabe öffentlich eingereichter Prüfungen. */
export interface EinreichungStorage {
  readonly bezeichnung: string;

  /** Offene Einreichungen, serverseitig auf die eigenen Freigabegruppen gefiltert. */
  ladeOffene(): Promise<CheckEinreichung[]>;

  /** Vollständige Einreichung samt Positionen; erst beim Aufklappen geladen. */
  ladeEinreichung(id: string): Promise<CheckEinreichungDetail | null>;

  /** Mehrfachfreigabe; liefert je Eintrag ein eigenes Ergebnis. */
  gibFrei(ids: readonly string[]): Promise<FreigabeAntwort[]>;

  lehneAb(id: string, grund: string): Promise<void>;
}

/** Die Einreichung wurde zwischenzeitlich schon entschieden. */
export class EinreichungNichtOffenFehler extends Error {
  constructor() {
    super('Diese Meldung wurde zwischenzeitlich bereits entschieden.');
    this.name = 'EinreichungNichtOffenFehler';
  }
}
