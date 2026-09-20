/** Öffentliches Erfassungstoken eines Fahrzeugs; `token` ist `null`, solange keines vergeben ist. */
export interface Erfassungslink {
  fahrzeugId: string;
  token: string | null;
}

/** Wie `Erfassungslink`, zusätzlich mit den Angaben für den Übersichtsbogen. */
export interface ErfassungslinkMitFahrzeug extends Erfassungslink {
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
}

/**
 * Vertrag für die öffentlichen Erfassungstoken. Bewusst getrennt von
 * `FahrzeugStorage`: das Token ist ein Geheimnis und gehört nicht in die
 * Fahrzeugliste, über die es bis in den Einsatzplaner reichte.
 */
export interface ErfassungslinkStorage {
  /** Token eines einzelnen Fahrzeugs; steht jeder geprüften Identität offen. */
  ladeLink(fahrzeugId: string): Promise<Erfassungslink>;

  /**
   * Alle Links der Gruppen, für die die angemeldete Person freigeben darf.
   * Ohne passende Rolle leer statt abgewiesen.
   */
  ladeLinks(): Promise<ErfassungslinkMitFahrzeug[]>;

  /**
   * Erzeugt ein neues Token. Alle bereits gedruckten Aufkleber dieses Fahrzeugs
   * werden damit sofort ungültig.
   */
  erneuere(fahrzeugId: string): Promise<Erfassungslink>;
}
