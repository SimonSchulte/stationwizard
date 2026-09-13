import { Kilometerstand } from '../models/fahrzeug.model';

/** Ab dieser Differenz zum letzten Stand wird ein Sprung als unplausibel markiert. */
export const UNPLAUSIBLER_SPRUNG_KM = 5000;

/** Fahrzeuge ohne Ablesung seit dieser Anzahl Tage fallen im Dashboard auf. */
export const ABLESE_LUECKE_TAGE = 30;

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
  return tageDifferenz(letzteAblesung.abgelesenAm, stichtagIso) > ABLESE_LUECKE_TAGE;
}
