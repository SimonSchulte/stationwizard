/** Geld wird durchgehend als Integer-Cent geführt; diese Funktionen sind der einzige Umrechnungsweg. */

const FORMATIERER = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function formatEuro(cent: number): string {
  return FORMATIERER.format(cent / 100);
}

/** Euro-Betrag für ein Eingabefeld (`type="number"`), zwei Nachkommastellen, ohne Währungszeichen. */
export function centZuEuroEingabe(cent: number): string {
  return (cent / 100).toFixed(2);
}

/** Rückrichtung zu `centZuEuroEingabe`; `null` bei ungültiger oder negativer Eingabe. */
export function euroEingabeZuCent(wert: string): number | null {
  const zahl = Number(wert.replace(',', '.').trim());
  if (!Number.isFinite(zahl) || zahl < 0) return null;
  return Math.round(zahl * 100);
}

const STUNDEN_FORMATIERER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** Stunden mit deutschem Dezimalkomma („7,5“), höchstens zwei Nachkommastellen, ohne Nullen am Ende. */
export function formatStunden(stunden: number): string {
  return STUNDEN_FORMATIERER.format(stunden);
}
