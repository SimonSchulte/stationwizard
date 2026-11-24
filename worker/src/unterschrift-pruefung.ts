import { istObjekt, istText } from './json-lesen';

/**
 * Form und Grenzen einer Unterschrift. Das Frontend prüft dieselben Werte
 * (`src/app/kern/unterschrift/unterschrift.model.ts`); beide Fassungen sind gemeinsam zu ändern.
 */
export const UNTERSCHRIFT_SCHRIFTEN = ['Dancing Script', 'Caveat', 'Reenie Beanie'] as const;
export const UNTERSCHRIFT_TEXT_MAX = 80;
export const UNTERSCHRIFT_BREITE = 480;
export const UNTERSCHRIFT_HOEHE = 160;
export const UNTERSCHRIFT_STRICHE_MAX = 20;
export const UNTERSCHRIFT_PUNKTE_MAX = 2000;
/** Obergrenze des serialisierten JSON, als zweite Absicherung neben den Einzelgrenzen. */
export const UNTERSCHRIFT_BYTES_MAX = 32 * 1024;

export type UnterschriftDaten =
  | { art: 'schrift'; text: string; font: (typeof UNTERSCHRIFT_SCHRIFTEN)[number] }
  | { art: 'zeichnung'; striche: [number, number][][] };

function istKoordinate(wert: unknown, max: number): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= 0 && wert <= max;
}

/** Gibt die normalisierte Unterschrift zurück oder `null`; unbekannte Felder werden abgelehnt. */
export function pruefeUnterschrift(wert: unknown): UnterschriftDaten | null {
  if (!istObjekt(wert)) return null;
  const schluessel = Object.keys(wert).sort().join(',');

  if (wert['art'] === 'schrift') {
    if (schluessel !== 'art,font,text') return null;
    const text = wert['text'];
    const font = wert['font'];
    if (!istText(text) || !istText(font)) return null;
    const bereinigt = text.trim();
    if (bereinigt.length === 0 || bereinigt.length > UNTERSCHRIFT_TEXT_MAX) return null;
    const bekannt = UNTERSCHRIFT_SCHRIFTEN.find((f) => f === font);
    return bekannt ? { art: 'schrift', text: bereinigt, font: bekannt } : null;
  }

  if (wert['art'] === 'zeichnung') {
    if (schluessel !== 'art,striche') return null;
    const striche = wert['striche'];
    if (!Array.isArray(striche) || striche.length === 0) return null;
    if (striche.length > UNTERSCHRIFT_STRICHE_MAX) return null;
    let punkte = 0;
    const ergebnis: [number, number][][] = [];
    for (const strich of striche) {
      if (!Array.isArray(strich) || strich.length === 0) return null;
      punkte += strich.length;
      if (punkte > UNTERSCHRIFT_PUNKTE_MAX) return null;
      const neu: [number, number][] = [];
      for (const punkt of strich) {
        if (!Array.isArray(punkt) || punkt.length !== 2) return null;
        const [x, y] = punkt as unknown[];
        if (!istKoordinate(x, UNTERSCHRIFT_BREITE) || !istKoordinate(y, UNTERSCHRIFT_HOEHE)) {
          return null;
        }
        neu.push([x, y]);
      }
      ergebnis.push(neu);
    }
    const daten: UnterschriftDaten = { art: 'zeichnung', striche: ergebnis };
    return JSON.stringify(daten).length <= UNTERSCHRIFT_BYTES_MAX ? daten : null;
  }

  return null;
}
