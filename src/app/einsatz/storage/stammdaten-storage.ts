import {
  Artikel,
  ArtikelEingabe,
  Kiste,
  KisteEingabe,
  Lager,
  LagerEingabe,
} from '../models/stammdaten.model';

/**
 * Persistenz der Stammdaten (Lager, Artikel). Die Fachschicht kennt nur dieses Interface; der
 * Adapter gegen `/api/einsatzplanung/lager` und `/artikel` übersetzt Fehler in die Typen unten.
 */
export interface StammdatenStorage {
  readonly bezeichnung: string;

  ladeLager(): Promise<Lager[]>;
  /** `version` ist die zuletzt bekannte Version der Zeile; `null` bedeutet Neuanlage. */
  speichereLager(eingabe: LagerEingabe, version: number | null): Promise<Lager>;
  loescheLager(id: string, version: number): Promise<void>;
  /** Nennt alle Lager-Ids in der neuen Reihenfolge und liefert die Liste neu zurück. */
  setzeLagerReihenfolge(ids: readonly string[]): Promise<Lager[]>;

  ladeArtikel(): Promise<Artikel[]>;
  speichereArtikel(eingabe: ArtikelEingabe, version: number | null): Promise<Artikel>;
  loescheArtikel(id: string, version: number): Promise<void>;

  ladeKisten(): Promise<Kiste[]>;
  speichereKiste(eingabe: KisteEingabe, version: number | null): Promise<Kiste>;
  loescheKiste(id: string, version: number): Promise<void>;
}

/** Die Zeile (oder die Lagerliste) wurde zwischenzeitlich geändert: neu laden. */
export class StammdatenKonfliktFehler extends Error {
  constructor() {
    super('Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden.');
    this.name = 'StammdatenKonfliktFehler';
  }
}

/** Der Name ist schon vergeben (Vergleich ohne Groß-/Kleinschreibung und überzählige Leerzeichen). */
export class StammdatenNameVergebenFehler extends Error {
  constructor(readonly art: 'lager' | 'artikel' | 'kiste') {
    super(
      art === 'lager'
        ? 'Dieses Lager gibt es schon.'
        : art === 'artikel'
          ? 'Diesen Artikel gibt es schon.'
          : 'Diese Kiste gibt es schon.',
    );
    this.name = 'StammdatenNameVergebenFehler';
  }
}

/** Lager (Heimatlager von Artikeln oder Kisten) und Artikel (in einer Kiste) lassen sich nicht löschen, solange sie verwendet werden. */
export class StammdatenInNutzungFehler extends Error {
  constructor(readonly art: 'lager' | 'artikel' = 'lager') {
    super(
      art === 'lager'
        ? 'Dieses Lager ist noch Heimatlager von Artikeln oder Kisten.'
        : 'Dieser Artikel ist noch in einer Kiste enthalten.',
    );
    this.name = 'StammdatenInNutzungFehler';
  }
}
