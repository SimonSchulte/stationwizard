import { Ablesungseinreichung } from '../models/fahrzeug.model';

/**
 * Vertrag für die Freigabe öffentlicher Kilometermeldungen. Die Fachschicht
 * kennt nur dieses Interface, analog zu `FahrzeugStorage` und `KmBerichtStorage`.
 */
export interface EinreichungStorage {
  /**
   * Offene Meldungen. Der Worker filtert serverseitig auf die Gruppen, für die
   * die angemeldete Person freigeben darf – ohne passende Rolle ist die Liste
   * leer, nicht abgewiesen.
   */
  ladeOffene(): Promise<Ablesungseinreichung[]>;

  /** Erzeugt aus der Meldung die echte Ablesung. */
  freigeben(einreichungId: string): Promise<void>;

  /** Verwirft die Meldung; `grund` ist optional und wird protokolliert. */
  ablehnen(einreichungId: string, grund: string): Promise<void>;
}

/**
 * Aus HTTP 403: die Sitzung ist gültig, aber die Rolle reicht nicht. Bewusst
 * eine eigene Klasse, damit die Oberfläche das nicht mit einer abgelaufenen
 * Sitzung verwechselt.
 */
export class FreigabeVerweigertFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'FreigabeVerweigertFehler';
  }
}

/** Aus HTTP 409: jemand anderes hat die Meldung bereits entschieden. */
export class EinreichungNichtOffenFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'EinreichungNichtOffenFehler';
  }
}
