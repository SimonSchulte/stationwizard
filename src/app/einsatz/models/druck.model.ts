import type { Fachgruppe } from '../../kern/fachgruppen/fachgruppe';

/**
 * Farbpalette der Abschnitte und das Druckmodell. Die frühere Vorbereitung (VB) gibt es nicht
 * mehr; der Aufbau bringt seine Zettel in diese Form (`aufbau-druck.ts`), damit der vorhandene
 * Druck (Laufzettelstreifen, Schilder) sie lesen kann.
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

export interface DruckPosition {
  id: string;
  /** Id des Gegenstücks in der Vorlage; in Vorlagen `null`. */
  herkunftId: string | null;
  /** Text, darf leer sein (0–20). */
  anzahl: string;
  /** 1–200 Zeichen. */
  material: string;
  /**
   * `true`: Hinweis statt Material – Text ohne Anzahl und ohne Abhakkästchen, der auf dem
   * Laufzettel wie jede Position Platz belegt. Fehlt bei gewöhnlichen Positionen.
   */
  hinweis?: true;
}

export interface DruckLaufzettel {
  id: string;
  herkunftId: string | null;
  ueberschrift: string;
  lagerort: string;
  transportMit: string;
  /** Auftraggeber für Rückfragen. */
  auftraggeber: string;
  fachgruppe: Fachgruppe | null;
  positionen: DruckPosition[];
}

export interface DruckAbschnitt {
  id: string;
  herkunftId: string | null;
  /** 1–200 Zeichen. */
  titel: string;
  farbe: AbschnittFarbe;
  fachgruppe: Fachgruppe | null;
  /** Foto für die Verladung (JPEG als Data-URL); kommt mit auf den Druck. Fehlt, wenn es keins gibt. */
  foto?: string;
  laufzettel: DruckLaufzettel[];
}

/** Druckmodell: so liest der Druck (Laufzettelstreifen, Schilder) seinen Inhalt; der Aufbau bringt seine Zettel hierin. */
/** Ein Aushang (Schild, A5 quer) mit fertigen Inhaltszeilen; je Einheit eines, auch je Wagen. */
export interface DruckSchild {
  id: string;
  titel: string;
  farbe: AbschnittFarbe;
  /** JPEG als Data-URL für den Rahmen; fehlt, wenn es keins gibt. */
  foto?: string;
  /** Soll-Inhalt in Druckreihenfolge, eine Zeile je Eintrag. */
  zeilen: string[];
}

export interface DruckInhalt {
  anweisungen: string;
  abschnitte: DruckAbschnitt[];
  /** Fehlt oder leer: die Schilder kommen aus den Abschnitten (Zettelliste). */
  schilder?: DruckSchild[];
  /** Fehlt oder leer: kein Packzettel je Kiste. Ein Abschnitt je Ziel, ein Laufzettel je Kiste. */
  kistenzettel?: DruckAbschnitt[];
}
