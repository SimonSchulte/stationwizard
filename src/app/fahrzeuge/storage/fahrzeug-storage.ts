import { AblesungEingabe, Fahrzeugstamm, Kilometerstand } from '../models/fahrzeug.model';

/**
 * Gemeinsamer Vertrag für die Persistenz des Fahrzeugmoduls. Die Fachschicht
 * kennt nur dieses Interface – nicht, ob dahinter D1, ein anderes Backend
 * oder (in Tests) ein In-Memory-Speicher steckt. Ein Backendwechsel bleibt
 * damit auf einen neuen Adapter begrenzt (siehe docs/konzept-fahrzeuge.md,
 * Abschnitt 8 „Was das für die Trennung bedeutet").
 */
/** Fahrzeug plus der Version, gegen die ein späteres Speichern geprüft wird. */
export interface FahrzeugMitVersion {
  daten: Fahrzeugstamm;
  version: string;
}

export interface FahrzeugStorage {
  readonly bezeichnung: string;

  /** Liste ohne Version – zum Bearbeiten immer zuerst `ladeFahrzeug()` aufrufen. */
  ladeFahrzeuge(): Promise<Fahrzeugstamm[]>;
  ladeFahrzeug(id: string): Promise<FahrzeugMitVersion | null>;

  /**
   * Legt an oder aktualisiert. `version` ist eine für die Fachschicht
   * undurchsichtige Kennung des zuletzt gelesenen Stands (z. B. ein ETag) –
   * `null` bedeutet Neuanlage. Bei einem Konflikt wirft der Adapter
   * `FahrzeugKonfliktFehler`.
   *
   * @returns die neue Versionskennung.
   */
  speichereFahrzeug(fahrzeug: Fahrzeugstamm, version: string | null): Promise<string>;

  /** Ohne `vonJahr` wird die vollständige Historie geliefert. */
  ladeAblesungen(fahrzeugId: string, vonJahr?: number): Promise<Kilometerstand[]>;

  /**
   * Hängt eine Ablesung an. `erfasstVon` und `erfasstAm` setzt der Adapter
   * aus der geprüften Identität bzw. der Serverzeit – niemals aus der
   * Eingabe, damit eine Erfassung nicht im Namen einer anderen Person
   * möglich ist.
   */
  ergaenzeAblesung(eingabe: AblesungEingabe): Promise<Kilometerstand>;
}

/** Wird geworfen, wenn `version` beim Speichern nicht mehr aktuell ist. */
export class FahrzeugKonfliktFehler extends Error {
  constructor(readonly fahrzeugId: string) {
    super('Das Fahrzeug wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.');
    this.name = 'FahrzeugKonfliktFehler';
  }
}
