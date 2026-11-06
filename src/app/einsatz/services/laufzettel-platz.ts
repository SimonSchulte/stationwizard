import { VbInhalt, VbLaufzettel } from '../models/vb.model';

/** Materialzeilen eines Laufzettelstreifens (festes Raster, siehe Konzept Abschnitt 6). */
export const LAUFZETTEL_KAPAZITAET = 23;
/** Ab dieser Belegung gilt ein Laufzettel als knapp. */
export const LAUFZETTEL_KNAPP_AB = 21;

/** Kleinste und größte wählbare Zahl Laufzettelstreifen je A4-Querseite. */
export const STREIFEN_MIN = 3;
export const STREIFEN_MAX = 6;
/** Vorgabe, solange nichts gewählt ist (passt zur Klemmleiste mit sechs Plätzen). */
export const STREIFEN_STANDARD = 6;
/** Die wählbaren Werte in aufsteigender Reihenfolge. */
export const STREIFEN_WAHL: readonly number[] = [3, 4, 5, 6];

/** A4 quer in pt (1 mm = 72 / 25,4 pt). */
const SEITE_BREITE = 841.89;
/** Innenränder eines Streifens und Spalten des Materialrasters in pt (siehe `vb-pdf-definition.ts`). */
const INNEN_RAND = 13 + 11;
const MATERIAL_FIXSPALTEN = 10 + 28 + 4;
const ZIEL_BESCHRIFTUNG = 34;
const INFO_BESCHRIFTUNG = 52;
/**
 * Mittlere Zeichenbreite in pt: Roboto 9 pt gemessen 4,17; beim bisherigen 3er-Layout ergibt
 * der Sicherheitsabschlag von 25 % genau die 38 Zeichen je Materialzeile.
 */
const MATERIAL_PT_JE_ZEICHEN = 4.17 / 0.75;
/** Fette 10,5 pt (Zielblock) und 8 pt (Infozeile), aus dem bisherigen 3er-Layout abgeleitet. */
const ZIEL_PT_JE_ZEICHEN = 6.5;
const INFO_PT_JE_ZEICHEN = 4.65;

/** Zeichen je Zeile der drei Textbereiche eines Streifens; hängt von dessen Breite ab. */
export interface LaufzettelMasse {
  streifenJeSeite: number;
  /** Zeichen je Materialzeile. */
  zeichenJeZeile: number;
  /** Zeichen je Zielzeile („VON“, „AUF / IN“). */
  zeichenJeZielzeile: number;
  /** Zeichen je Info-Zeile („Rückfragen an“). */
  zeichenJeInfozeile: number;
}

/** Begrenzt auf 3 bis 6 und rundet; alles Unbrauchbare ergibt die Vorgabe. */
export function gueltigeStreifenZahl(wert: number): number {
  if (!Number.isFinite(wert)) return STREIFEN_STANDARD;
  return Math.min(STREIFEN_MAX, Math.max(STREIFEN_MIN, Math.round(wert)));
}

/**
 * Textbreiten eines Streifens bei `streifenJeSeite` Streifen je Seite. Der Druck und die
 * Platzberechnung im Editor verwenden dieselben Zahlen. Beim Druck zu eichen.
 */
export function laufzettelMasse(streifenJeSeite: number = STREIFEN_STANDARD): LaufzettelMasse {
  const zahl = gueltigeStreifenZahl(streifenJeSeite);
  const feld = SEITE_BREITE / zahl - INNEN_RAND;
  return {
    streifenJeSeite: zahl,
    zeichenJeZeile: Math.floor((feld - MATERIAL_FIXSPALTEN) / MATERIAL_PT_JE_ZEICHEN),
    zeichenJeZielzeile: Math.floor((feld - ZIEL_BESCHRIFTUNG) / ZIEL_PT_JE_ZEICHEN),
    zeichenJeInfozeile: Math.floor((feld - INFO_BESCHRIFTUNG) / INFO_PT_JE_ZEICHEN),
  };
}

export type PlatzZustand = 'ok' | 'knapp' | 'zu-voll';

export interface LaufzettelPlatz {
  belegt: number;
  kapazitaet: number;
  zustand: PlatzZustand;
}

function zeilen(text: string, zeichenJeZeile: number): number {
  return Math.ceil(text.length / zeichenJeZeile);
}

/** Materialzeilen einer Position: mindestens eine. */
export function positionsZeilen(material: string, masse: LaufzettelMasse): number {
  return Math.max(1, zeilen(material, masse.zeichenJeZeile));
}

/**
 * Belegte Materialzeilen eines Laufzettels bei `streifenJeSeite` Streifen je Seite. Der Druck und der Editor verwenden dieselbe
 * Funktion, damit Warnung und Ausdruck nie auseinanderlaufen.
 *
 * - Eine Position belegt `max(1, ⌈Zeichen / zeichenJeZeile⌉)` Zeilen (38 bei drei, 13 bei sechs Streifen).
 * - Lagerort („VON“) und Transport („AUF / IN“) stehen im Zielblock mit je
 *   `zeichenJeZielzeile` Zeichen, „Rückfragen an“ in einer kleinen Info-Zeile. Jede
 *   Umbruchzeile darüber hinaus zählt; die erste Umbruchzeile (über alle drei Felder) ist
 *   Reserve, jede weitere kostet eine Materialzeile.
 */
export function laufzettelPlatz(
  laufzettel: VbLaufzettel,
  streifenJeSeite: number = STREIFEN_STANDARD,
): LaufzettelPlatz {
  const masse = laufzettelMasse(streifenJeSeite);
  let belegt = 0;
  for (const position of laufzettel.positionen) {
    belegt += positionsZeilen(position.material, masse);
  }
  let umbruchzeilen = 0;
  const felder: [string, number][] = [
    [laufzettel.lagerort, masse.zeichenJeZielzeile],
    [laufzettel.transportMit, masse.zeichenJeZielzeile],
    [laufzettel.auftraggeber, masse.zeichenJeInfozeile],
  ];
  for (const [text, zeichen] of felder) {
    umbruchzeilen += Math.max(0, zeilen(text, zeichen) - 1);
  }
  belegt += Math.max(0, umbruchzeilen - 1);

  const zustand: PlatzZustand =
    belegt > LAUFZETTEL_KAPAZITAET ? 'zu-voll' : belegt >= LAUFZETTEL_KNAPP_AB ? 'knapp' : 'ok';
  return { belegt, kapazitaet: LAUFZETTEL_KAPAZITAET, zustand };
}

/** Laufende Nummer je Laufzettel-Id, fortlaufend über alle Abschnitte ab 1 (nie gespeichert). */
export function laufzettelNummern(inhalt: VbInhalt): Map<string, number> {
  const nummern = new Map<string, number>();
  let nummer = 0;
  for (const abschnitt of inhalt.abschnitte) {
    for (const laufzettel of abschnitt.laufzettel) {
      nummer += 1;
      nummern.set(laufzettel.id, nummer);
    }
  }
  return nummern;
}

/** Alle Laufzettel, die nicht auf einen Streifen passen, in Druckreihenfolge. */
export function zuVolleLaufzettel(
  inhalt: VbInhalt,
  streifenJeSeite: number = STREIFEN_STANDARD,
): VbLaufzettel[] {
  return inhalt.abschnitte
    .flatMap((abschnitt) => abschnitt.laufzettel)
    .filter((laufzettel) => laufzettelPlatz(laufzettel, streifenJeSeite).zustand === 'zu-voll');
}

/**
 * Ids der Positionen, die hinter der letzten noch passenden Position liegen – die Vorgabe für
 * „In zwei Laufzettel aufteilen“. Mindestens eine Position bleibt immer im ersten Laufzettel.
 * Ein Laufzettel, der passt, liefert eine leere Liste.
 */
export function ueberlaufPositionen(
  laufzettel: VbLaufzettel,
  streifenJeSeite: number = STREIFEN_STANDARD,
): string[] {
  if (laufzettelPlatz(laufzettel, streifenJeSeite).zustand !== 'zu-voll') return [];
  const masse = laufzettelMasse(streifenJeSeite);
  const zeilenJePosition = laufzettel.positionen.map((p) => positionsZeilen(p.material, masse));
  const summe = zeilenJePosition.reduce((a, b) => a + b, 0);
  const infoKosten = laufzettelPlatz(laufzettel, streifenJeSeite).belegt - summe;
  const verfuegbar = LAUFZETTEL_KAPAZITAET - infoKosten;
  let belegt = 0;
  let schnitt = laufzettel.positionen.length;
  for (let i = 0; i < zeilenJePosition.length; i += 1) {
    belegt += zeilenJePosition[i];
    if (belegt > verfuegbar) {
      schnitt = Math.max(1, i);
      break;
    }
  }
  return laufzettel.positionen.slice(schnitt).map((p) => p.id);
}
