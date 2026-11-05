import { VbInhalt, VbLaufzettel } from '../models/vb.model';

/** Materialzeilen eines Laufzettelstreifens (festes Raster, siehe Konzept Abschnitt 6). */
export const LAUFZETTEL_KAPAZITAET = 23;
/** Zeichen je Materialzeile (Breite bei 13 pt auf dem Streifen; beim Druck zu eichen). */
export const ZEICHEN_JE_ZEILE = 38;
/** Zeichen je Zielzeile (VON, AUF / IN; 10,5 pt fett, beim Druck zu eichen). */
export const ZEICHEN_JE_ZIELZEILE = 34;
/** Zeichen je Info-Zeile („Rückfragen an“, 8 pt). */
export const ZEICHEN_JE_INFOZEILE = 44;
/** Ab dieser Belegung gilt ein Laufzettel als knapp. */
export const LAUFZETTEL_KNAPP_AB = 21;

export type PlatzZustand = 'ok' | 'knapp' | 'zu-voll';

export interface LaufzettelPlatz {
  belegt: number;
  kapazitaet: number;
  zustand: PlatzZustand;
}

function zeilen(text: string, zeichenJeZeile: number): number {
  return Math.ceil(text.length / zeichenJeZeile);
}

/**
 * Belegte Materialzeilen eines Laufzettels. Der Druck und der Editor verwenden dieselbe
 * Funktion, damit Warnung und Ausdruck nie auseinanderlaufen.
 *
 * - Eine Position belegt `max(1, ⌈Zeichen / 38⌉)` Zeilen.
 * - Lagerort („VON“) und Transport („AUF / IN“) stehen im Zielblock mit je
 *   `ZEICHEN_JE_ZIELZEILE` Zeichen, „Rückfragen an“ in einer kleinen Info-Zeile. Jede
 *   Umbruchzeile darüber hinaus zählt; die erste Umbruchzeile (über alle drei Felder) ist
 *   Reserve, jede weitere kostet eine Materialzeile.
 */
export function laufzettelPlatz(laufzettel: VbLaufzettel): LaufzettelPlatz {
  let belegt = 0;
  for (const position of laufzettel.positionen) {
    belegt += Math.max(1, zeilen(position.material, ZEICHEN_JE_ZEILE));
  }
  let umbruchzeilen = 0;
  const felder: [string, number][] = [
    [laufzettel.lagerort, ZEICHEN_JE_ZIELZEILE],
    [laufzettel.transportMit, ZEICHEN_JE_ZIELZEILE],
    [laufzettel.auftraggeber, ZEICHEN_JE_INFOZEILE],
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
export function zuVolleLaufzettel(inhalt: VbInhalt): VbLaufzettel[] {
  return inhalt.abschnitte
    .flatMap((abschnitt) => abschnitt.laufzettel)
    .filter((laufzettel) => laufzettelPlatz(laufzettel).zustand === 'zu-voll');
}

/**
 * Ids der Positionen, die hinter der letzten noch passenden Position liegen – die Vorgabe für
 * „In zwei Laufzettel aufteilen“. Mindestens eine Position bleibt immer im ersten Laufzettel.
 * Ein Laufzettel, der passt, liefert eine leere Liste.
 */
export function ueberlaufPositionen(laufzettel: VbLaufzettel): string[] {
  if (laufzettelPlatz(laufzettel).zustand !== 'zu-voll') return [];
  const zeilenJePosition = laufzettel.positionen.map((p) =>
    Math.max(1, zeilen(p.material, ZEICHEN_JE_ZEILE)),
  );
  const summe = zeilenJePosition.reduce((a, b) => a + b, 0);
  const infoKosten = laufzettelPlatz(laufzettel).belegt - summe;
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
