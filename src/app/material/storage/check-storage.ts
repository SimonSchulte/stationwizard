import {
  CheckKopf,
  CheckpositionEingabe,
  Fahrzeugcheck,
  Pruefauftrag,
} from '../models/check.model';

/** Was beim Einreichen eines Checks gesendet wird. */
export interface CheckEingabe {
  id: string;
  verfallsdatumErfasst: boolean;
  bemerkung: string;
  positionen: CheckpositionEingabe[];
}

export interface CheckStorage {
  readonly bezeichnung: string;

  /** Behälter, Fahrzeug und Vorlage in einem Aufruf. */
  ladePruefauftrag(behaelterId: string): Promise<Pruefauftrag | null>;

  /** Historie ohne Positionen. */
  ladeHistorie(behaelterId: string): Promise<CheckKopf[]>;

  ladeCheck(id: string): Promise<Fahrzeugcheck | null>;

  /** Legt den Check an; ein Check wird nie überschrieben. */
  reicheCheckEin(behaelterId: string, check: CheckEingabe): Promise<Fahrzeugcheck>;
}

/**
 * Die Positionen decken die Prüfvorlage nicht genau ab, oder der Check enthält
 * keine einzige geprüfte Position. Erneutes Senden hilft nicht.
 */
export class CheckUnschluessigFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'CheckUnschluessigFehler';
  }
}
