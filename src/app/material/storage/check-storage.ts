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

export const BERICHTSARTEN = ['bestellschein', 'maengel-land', 'maengel-seg'] as const;
export type Berichtsart = (typeof BERICHTSARTEN)[number];

export const BERICHTSART_TITEL: Readonly<Record<Berichtsart, string>> = {
  bestellschein: 'Bestellschein',
  'maengel-land': 'Mängelanzeige Land',
  'maengel-seg': 'Mängelanzeige SEG',
};

export const BERICHTSART_ERKLAERUNG: Readonly<Record<Berichtsart, string>> = {
  bestellschein: 'Fehlmengen zum Nachbestellen, Land vor SEG.',
  'maengel-land': 'Abgelaufenes und unbrauchbares Material aus der Landesliste.',
  'maengel-seg': 'Abgelaufenes und unbrauchbares Material der reinen SEG-Artikel.',
};

export interface Versandbestaetigung {
  art: Berichtsart;
  gesendetAn: string;
  gesendetAm: string;
  gesendetVon: string;
  versandweg: string;
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

  /**
   * Berichtstext zur Vorschau. Er entsteht ausschließlich im Worker – die
   * Oberfläche hält keine zweite Fassung der Berichtslogik.
   */
  ladeBericht(checkId: string, art: Berichtsart): Promise<string>;

  /**
   * Versendet denselben Bericht. `empfaenger` leer heißt: den in der
   * Systemkonfiguration hinterlegten Standardempfänger verwenden.
   */
  sendeBericht(checkId: string, art: Berichtsart, empfaenger: string): Promise<Versandbestaetigung>;
}

/** Kein Standardempfänger hinterlegt und keiner angegeben. */
export class EmpfaengerFehltFehler extends Error {
  constructor() {
    super(
      'Für diese Berichtsart ist kein Standardempfänger hinterlegt. Bitte eine Adresse angeben ' +
        'oder sie in der Systemkonfiguration festlegen.',
    );
    this.name = 'EmpfaengerFehltFehler';
  }
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
