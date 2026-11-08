import { Medizinisch, Taktisch } from './planung.model';

/**
 * PEP im Datenbankformat (Vertrag: `docs/konzept-einsatzplanung-vb.md`, Abschnitt 10).
 * Deutsche Feldnamen; der Editor behält sein englisches Modell `Planung`, die Umsetzung
 * steht allein in `services/pep-abbildung.ts`.
 */

export interface PepFahrzeug {
  funkruf: string;
  seriennummer: string | null;
  hiorgId: string | null;
}

export interface PepAnforderungen {
  taktisch: Taktisch | null;
  medizinisch: Medizinisch | null;
  zusatz: string | null;
}

export interface PepPosition {
  id: string;
  /** 0–200 Zeichen. */
  bezeichnung: string;
  anforderungen: PepAnforderungen;
  postenfuehrer: boolean;
  /** Id aus `einsatzkraefte` oder `null`. */
  einsatzkraftId: string | null;
}

export interface PepPosten {
  id: string;
  /** 1–200 Zeichen. */
  bezeichnung: string;
  fahrzeug: PepFahrzeug | null;
  telefonnummer: string | null;
  hiorgSchichtId: string | null;
  positionen: PepPosition[];
}

export interface PepEinsatzkraft {
  /** Innerhalb der PEP eindeutig (bisherige Ids bleiben gültig). */
  id: string;
  /** „Nachname Vorname“, 1–200 Zeichen. */
  name: string;
  taktisch: Taktisch[];
  medizinisch: Medizinisch[];
  zusatz: string[];
  notiz: string | null;
  hiorgOrgId: string | null;
  telefonnummer: string | null;
  /** Benutzerkürzel aus HiOrg; fehlt bei Altbestand und Personen ohne Kürzel. */
  kuerzel?: string | null;
}

export interface PepInhalt {
  beschreibung: string;
  posten: PepPosten[];
  einsatzkraefte: PepEinsatzkraft[];
  /** Id aus `einsatzkraefte`. */
  einsatzleiterId: string | null;
}

/** Vorlage: Posten mit leeren Besetzungen, keine Einsatzkräfte, keine Einsatzleitung. */
export interface PepVorlageInhalt {
  beschreibung: string;
  posten: PepPosten[];
}

export interface Pep {
  schema: 1;
  /** Nur Nachverfolgung. */
  vorlageId: string | null;
  inhalt: PepInhalt;
}

export interface PepVorlage {
  /** UUID. */
  id: string;
  /** 1–200 Zeichen. */
  titel: string;
  inhalt: PepVorlageInhalt;
}

/** Kennzahlen einer PEP, vom Worker als Spalten geführt (Einsatzliste, Vorlagenliste). */
export interface PepKennzahlen {
  posten: number;
  positionen: number;
  besetzt: number;
}

export interface PepVorlageKopf {
  id: string;
  titel: string;
  version: number;
  posten: number;
  positionen: number;
  geaendertAm: string;
}

/**
 * Grenzen aus dem Vertrag. Nicht im Vertrag genannt und hier großzügig gewählt:
 * `zusatzAnforderung` (Freitext einer Positionsanforderung) sowie die Texte von Funkruf und
 * Seriennummer (`bezeichnung`) und `hiorgId`/`hiorgOrgId` (`id`).
 */
export const PEP_GRENZEN = {
  beschreibung: 2000,
  posten: 100,
  positionenJePosten: 50,
  einsatzkraefte: 500,
  id: 64,
  bezeichnung: 200,
  titel: 200,
  name: 200,
  telefonnummer: 50,
  kuerzel: 20,
  hiorgSchichtId: 64,
  zusatzAnforderung: 200,
  zusatzJeEinsatzkraft: 30,
  zusatzText: 100,
  notiz: 500,
} as const;
