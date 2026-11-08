import type { Fachgruppe } from '../../kern/fachgruppen/fachgruppe';

/**
 * Datenvertrag der Vorbereitung (VB), identisch mit dem Worker
 * (`docs/konzept-einsatzplanung-vb.md`, Abschnitt 9). Alle Ids sind UUIDs.
 */

/** Schlüssel der festen Abschnittspalette (Tokens `--abschnitt-1` … `--abschnitt-8`). */
export type AbschnittFarbe =
  | 'abschnitt-1'
  | 'abschnitt-2'
  | 'abschnitt-3'
  | 'abschnitt-4'
  | 'abschnitt-5'
  | 'abschnitt-6'
  | 'abschnitt-7'
  | 'abschnitt-8';

export const ABSCHNITT_FARBEN: readonly AbschnittFarbe[] = [
  'abschnitt-1',
  'abschnitt-2',
  'abschnitt-3',
  'abschnitt-4',
  'abschnitt-5',
  'abschnitt-6',
  'abschnitt-7',
  'abschnitt-8',
];

export const ABSCHNITT_FARBE_BEZEICHNUNG: Record<AbschnittFarbe, string> = {
  'abschnitt-1': 'Orange',
  'abschnitt-2': 'Petrol',
  'abschnitt-3': 'Magenta',
  'abschnitt-4': 'Violett',
  'abschnitt-5': 'Gelb',
  'abschnitt-6': 'Oliv',
  'abschnitt-7': 'Blau',
  'abschnitt-8': 'Braun',
};

/** Grenzen laut Vertrag; der Worker prüft dieselben Werte. */
export const VB_GRENZEN = {
  abschnitte: 30,
  laufzettel: 300,
  positionen: 50,
  /** Titel, Überschrift, Lagerort, Transport, Auftraggeber, Material. */
  text: 200,
  anzahl: 20,
  anweisungen: 6000,
  /** Verladungsfoto eines Abschnitts als JPEG-Data-URL (Zeichen). */
  foto: 100_000,
} as const;

/** Format, in dem das Verladungsfoto gespeichert wird (der Worker prüft dasselbe Muster). */
export const FOTO_MUSTER = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export interface VbPosition {
  id: string;
  /** Id des Gegenstücks in der Vorlage; in Vorlagen `null`. */
  herkunftId: string | null;
  /** Text, darf leer sein (0–20). */
  anzahl: string;
  /** 1–200 Zeichen. */
  material: string;
}

export interface VbLaufzettel {
  id: string;
  herkunftId: string | null;
  ueberschrift: string;
  lagerort: string;
  transportMit: string;
  /** Auftraggeber für Rückfragen. */
  auftraggeber: string;
  fachgruppe: Fachgruppe | null;
  positionen: VbPosition[];
}

export interface VbAbschnitt {
  id: string;
  herkunftId: string | null;
  /** 1–200 Zeichen. */
  titel: string;
  farbe: AbschnittFarbe;
  fachgruppe: Fachgruppe | null;
  /** Foto für die Verladung (JPEG als Data-URL); kommt mit auf den Druck. Fehlt, wenn es keins gibt. */
  foto?: string;
  laufzettel: VbLaufzettel[];
}

/** Inhalt von Vorlage und Vorbereitung (gleiche Struktur). */
export interface VbInhalt {
  anweisungen: string;
  abschnitte: VbAbschnitt[];
}

export interface Vorbereitung {
  vorlageId: string | null;
  vorlageVersion: number | null;
  inhalt: VbInhalt;
}

export interface VbVorlage {
  id: string;
  titel: string;
  inhalt: VbInhalt;
}

/** Listeneintrag einer Vorlage (ohne Inhalt) mit Kennzahlen. */
export interface VbVorlageKopf {
  id: string;
  titel: string;
  version: number;
  abschnitte: number;
  laufzettel: number;
  positionen: number;
  /** ISO-Zeitstempel, vom Worker gesetzt. */
  geaendertAm: string;
}
