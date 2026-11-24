/**
 * Form und Grenzen einer Unterschrift. Der Worker prüft dieselben Werte
 * (`worker/src/unterschrift-pruefung.ts`); beide Fassungen sind gemeinsam zu ändern.
 */
export const UNTERSCHRIFT_SCHRIFTEN = ['Dancing Script', 'Caveat', 'Reenie Beanie'] as const;
export type UnterschriftSchrift = (typeof UNTERSCHRIFT_SCHRIFTEN)[number];

export const UNTERSCHRIFT_TEXT_MAX = 80;
/** Zeichenfläche in Rasterpunkten; die Koordinaten einer Zeichnung liegen in diesem Raster. */
export const UNTERSCHRIFT_BREITE = 480;
export const UNTERSCHRIFT_HOEHE = 160;
export const UNTERSCHRIFT_STRICHE_MAX = 20;
export const UNTERSCHRIFT_PUNKTE_MAX = 2000;

export type UnterschriftPunkt = [number, number];

export type UnterschriftDaten =
  | { art: 'schrift'; text: string; font: UnterschriftSchrift }
  | { art: 'zeichnung'; striche: UnterschriftPunkt[][] };

function istKoordinate(wert: unknown, max: number): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= 0 && wert <= max;
}

/** Prüft unbekannte Daten (zum Beispiel eine Serverantwort); `null`, wenn sie nicht passen. */
export function pruefeUnterschrift(wert: unknown): UnterschriftDaten | null {
  if (typeof wert !== 'object' || wert === null || Array.isArray(wert)) return null;
  const objekt = wert as Record<string, unknown>;
  const schluessel = Object.keys(objekt).sort().join(',');

  if (objekt['art'] === 'schrift') {
    const text = objekt['text'];
    const font = UNTERSCHRIFT_SCHRIFTEN.find((f) => f === objekt['font']);
    if (schluessel !== 'art,font,text' || typeof text !== 'string' || !font) return null;
    const bereinigt = text.trim();
    if (bereinigt.length === 0 || bereinigt.length > UNTERSCHRIFT_TEXT_MAX) return null;
    return { art: 'schrift', text: bereinigt, font };
  }

  if (objekt['art'] === 'zeichnung') {
    const striche = objekt['striche'];
    if (schluessel !== 'art,striche' || !Array.isArray(striche)) return null;
    if (striche.length === 0 || striche.length > UNTERSCHRIFT_STRICHE_MAX) return null;
    let punkte = 0;
    const ergebnis: UnterschriftPunkt[][] = [];
    for (const strich of striche as unknown[]) {
      if (!Array.isArray(strich) || strich.length === 0) return null;
      punkte += strich.length;
      if (punkte > UNTERSCHRIFT_PUNKTE_MAX) return null;
      const neu: UnterschriftPunkt[] = [];
      for (const punkt of strich as unknown[]) {
        if (!Array.isArray(punkt) || punkt.length !== 2) return null;
        const [x, y] = punkt as unknown[];
        if (!istKoordinate(x, UNTERSCHRIFT_BREITE) || !istKoordinate(y, UNTERSCHRIFT_HOEHE)) {
          return null;
        }
        neu.push([x, y]);
      }
      ergebnis.push(neu);
    }
    return { art: 'zeichnung', striche: ergebnis };
  }

  return null;
}

/** Eine Zeichnung braucht mindestens einen Strich mit zwei Punkten, sonst ist sie nur ein Tupfer. */
export function istZeichnungBrauchbar(striche: readonly UnterschriftPunkt[][]): boolean {
  return striche.some((strich) => strich.length >= 2);
}
