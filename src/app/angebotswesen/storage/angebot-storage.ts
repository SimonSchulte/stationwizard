import { Angebot } from '../models/angebot.model';

/**
 * Gemeinsamer Vertrag für die Persistenz der Angebote. Die Fachschicht kennt
 * nur dieses Interface, analog zu `fahrzeuge/storage/fahrzeug-storage.ts`.
 */
export interface AngebotMitVersion {
  daten: Angebot;
  version: string;
}

export interface AngebotStorage {
  readonly bezeichnung: string;

  /** Liste ohne Version – zum Bearbeiten immer zuerst `ladeAngebot()` aufrufen. */
  ladeAngebote(): Promise<Angebot[]>;
  ladeAngebot(id: string): Promise<AngebotMitVersion | null>;

  /**
   * Legt an oder aktualisiert. `version` ist eine für die Fachschicht
   * undurchsichtige Kennung des zuletzt gelesenen Stands (z. B. ein ETag) –
   * `null` bedeutet Neuanlage. Bei einem Versionskonflikt wirft der Adapter
   * `AngebotKonfliktFehler`.
   *
   * @returns die neue Versionskennung.
   */
  speichereAngebot(angebot: Angebot, version: string | null): Promise<string>;

  loescheAngebot(id: string): Promise<void>;
}

/** Wird geworfen, wenn `version` beim Speichern nicht mehr aktuell ist. */
export class AngebotKonfliktFehler extends Error {
  constructor(readonly angebotId: string) {
    super('Das Angebot wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.');
    this.name = 'AngebotKonfliktFehler';
  }
}
