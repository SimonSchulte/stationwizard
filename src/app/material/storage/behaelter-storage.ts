import { Behaelter, BehaelterUebersicht } from '../models/behaelter.model';

/** Gemeinsamer Vertrag für die Persistenz der Behälter. */
export interface BehaelterMitVersion {
  daten: Behaelter;
  version: string;
}

export interface BehaelterStorage {
  readonly bezeichnung: string;

  /** Ein Aufruf über den ganzen Bestand, inklusive Fahrzeug, Vorlage und letztem Check. */
  ladeUebersicht(): Promise<BehaelterUebersicht[]>;

  ladeBehaelter(id: string): Promise<BehaelterMitVersion | null>;

  speichereBehaelter(behaelter: Behaelter, version: string | null): Promise<string>;

  loescheBehaelter(id: string): Promise<void>;
}

export class BehaelterKonfliktFehler extends Error {
  constructor(readonly behaelterId: string) {
    super('Der Behälter wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.');
    this.name = 'BehaelterKonfliktFehler';
  }
}

/** Löschen ist gesperrt, solange für den Behälter Checks erfasst sind. */
export class BehaelterInBenutzungFehler extends Error {
  constructor(readonly behaelterId: string) {
    super('Für diesen Behälter sind bereits Checks erfasst.');
    this.name = 'BehaelterInBenutzungFehler';
  }
}

/** Fahrzeug oder Prüfvorlage des Behälters existiert nicht (mehr). */
export class BehaelterVerweisFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'BehaelterVerweisFehler';
  }
}
