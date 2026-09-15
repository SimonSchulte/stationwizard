import { KmBericht, VersandQuittung } from '../models/km-bericht.model';

/**
 * Vertrag für Vorschau und Versand des Kilometerstandsberichts. Die
 * Fachschicht kennt nur dieses Interface, analog zu `FahrzeugStorage`.
 */
export interface KmBerichtStorage {
  /** Berechnet den Bericht, ohne etwas zu versenden. */
  ladeBericht(): Promise<KmBericht>;

  /**
   * Versendet den aktuell berechneten Bericht an die in der
   * Systemkonfiguration hinterlegte Adresse. Wirft
   * `VersandNichtMoeglichFehler`, solange Empfänger oder Versandweg fehlen –
   * das ist kein Serverfehler, sondern eine offene Einstellung.
   */
  sendeBericht(): Promise<VersandQuittung>;
}

export class VersandNichtMoeglichFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'VersandNichtMoeglichFehler';
  }
}
