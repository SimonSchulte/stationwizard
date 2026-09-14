import { Benutzerkonto, Hauptrolle, Sonderrolle } from '../models/benutzerkonto.model';

/**
 * Gemeinsamer Vertrag für die Persistenz der Benutzerverwaltung. Die
 * Fachschicht kennt nur dieses Interface, analog zu `FahrzeugStorage`.
 */
export interface BenutzerverwaltungStorage {
  /** Alle Personen, die sich bereits mindestens einmal geprüft angemeldet haben. */
  ladeBenutzer(): Promise<Benutzerkonto[]>;

  /**
   * Setzt Hauptrolle und Sonderrollen vollständig (kein teilweises Patchen).
   * Wirft `BenutzerNichtGefundenFehler`, wenn sich diese E-Mail-Adresse noch
   * nie angemeldet hat.
   */
  rolleSetzen(
    email: string,
    rolle: Hauptrolle | null,
    sonderrollen: Sonderrolle[],
  ): Promise<Benutzerkonto>;
}

/** Wird geworfen, wenn für die E-Mail-Adresse noch keine Anmeldung vorliegt. */
export class BenutzerNichtGefundenFehler extends Error {
  constructor(readonly email: string) {
    super('Diese Person hat sich noch nicht angemeldet.');
    this.name = 'BenutzerNichtGefundenFehler';
  }
}
