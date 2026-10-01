import { Kilometerstand } from '../models/fahrzeug.model';

/** Ab dieser Differenz zum letzten Stand wird ein Sprung als unplausibel markiert. */
export const UNPLAUSIBLER_SPRUNG_KM = 5000;

/** Fahrzeuge ohne Ablesung seit dieser Anzahl Tage fallen im Dashboard auf. */
export const ABLESE_LUECKE_TAGE = 30;

/** Obergrenze der öffentlichen Kilometermeldung; hier dieselbe, damit beide Wege gleich urteilen. */
export const KILOMETERSTAND_MAX = 9_999_999;

export type KilometerEingabeFehler = 'kein-zahlenwert' | 'keine-ganzzahl' | 'zu-gross';

export type KilometerEingabe =
  | { art: 'leer' }
  | { art: 'gueltig'; stand: number }
  | { art: 'ungueltig'; fehler: KilometerEingabeFehler };

/**
 * Liest eine Kilometerstand-Eingabe als ganze, nicht negative Zahl. Punkt,
 * Leerzeichen und geschütztes Leerzeichen sind nur als Tausendertrenner in
 * korrekter Gruppierung („12.345", „1 234 567") erlaubt; ein Komma oder ein
 * Punkt an anderer Stelle ist eine Nachkommastelle und wird abgelehnt statt
 * still zu einer anderen Zahl zu werden (`Number('12.345')` wäre 12,345).
 */
export function leseKilometerEingabe(text: string): KilometerEingabe {
  const roh = text.trim();
  if (roh === '') return { art: 'leer' };
  if (/^\d{1,3}([.\s\u00A0]\d{3})+$/.test(roh) || /^\d+$/.test(roh)) {
    const stand = Number(roh.replace(/[.\s\u00A0]/g, ''));
    return stand > KILOMETERSTAND_MAX
      ? { art: 'ungueltig', fehler: 'zu-gross' }
      : { art: 'gueltig', stand };
  }
  if (/^\d+([.,]\d+)?$|^\d{1,3}(\.\d{3})+,\d+$/.test(roh)) {
    return { art: 'ungueltig', fehler: 'keine-ganzzahl' };
  }
  return { art: 'ungueltig', fehler: 'kein-zahlenwert' };
}

export type AblesungHinweis = 'rueckschritt' | 'unplausibler-sprung' | null;

/**
 * Warnt vor einem Tachorückschritt oder einem unplausibel großen Sprung.
 * Beides blockiert die Erfassung nicht (ein Tachotausch mit Bemerkung ist
 * ein legitimer Fall), sondern liefert nur einen Hinweis für die Oberfläche.
 */
export function pruefeAblesungPlausibilitaet(
  neuerStand: number,
  letzteAblesung: Pick<Kilometerstand, 'stand'> | null,
): AblesungHinweis {
  if (letzteAblesung === null) {
    return null;
  }
  if (neuerStand < letzteAblesung.stand) {
    return 'rueckschritt';
  }
  if (neuerStand - letzteAblesung.stand > UNPLAUSIBLER_SPRUNG_KM) {
    return 'unplausibler-sprung';
  }
  return null;
}

function tageDifferenz(vonIso: string, bisIso: string): number {
  const [vy, vm, vd] = vonIso.split('-').map(Number);
  const [by, bm, bd] = bisIso.split('-').map(Number);
  const TAG_MS = 86_400_000;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(vy, vm - 1, vd)) / TAG_MS);
}

/**
 * `true`, wenn seit der letzten Ablesung (oder überhaupt, falls keine
 * existiert) mehr als `ABLESE_LUECKE_TAGE` vergangen sind.
 */
export function hatAbleseLuecke(
  letzteAblesung: Pick<Kilometerstand, 'abgelesenAm'> | null,
  stichtagIso: string,
): boolean {
  if (letzteAblesung === null) {
    return true;
  }
  return hatAbleseLueckeNachTagen(tageDifferenz(letzteAblesung.abgelesenAm, stichtagIso));
}

/**
 * Dieselbe Regel für Aufrufer, denen der Abstand bereits als Tageszahl
 * vorliegt – etwa `tageSeitAblesung` aus dem Kilometerstandsbericht des
 * Workers. `null` bedeutet dort "keine Ablesung" und damit immer eine Lücke.
 */
export function hatAbleseLueckeNachTagen(tageSeitAblesung: number | null): boolean {
  return tageSeitAblesung === null || tageSeitAblesung > ABLESE_LUECKE_TAGE;
}
