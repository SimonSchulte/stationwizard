const BENANNTE_ENTITAETEN = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);

/**
 * Dekodiert die HTML-Entitäten, die Fremdquellen in ihren Textfeldern liefern
 * (der HiOrg-Feed escaped unter anderem jeden Parametertrenner als `&amp;`).
 *
 * Bewusst **ein** Durchlauf ohne Wiederholung: `&amp;amp;` wird zu `&amp;` und
 * nicht weiter zu `&`, damit ein doppelt kodierter Eingabewert nicht
 * unbemerkt in etwas anderes umgedeutet wird.
 */
export function dekodiereEntitaeten(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (treffer, name: string) => {
    const klein = name.toLowerCase();
    if (klein.startsWith('#x')) {
      return zeichenAus(Number.parseInt(klein.slice(2), 16), treffer);
    }
    if (klein.startsWith('#')) {
      return zeichenAus(Number.parseInt(klein.slice(1), 10), treffer);
    }
    return BENANNTE_ENTITAETEN.get(klein) ?? treffer;
  });
}

function zeichenAus(codepunkt: number, treffer: string): string {
  // Steuerzeichen und ungültige Codepunkte bleiben als Rohtext stehen, statt
  // unsichtbar in einen Namen oder eine URL zu geraten.
  if (!Number.isInteger(codepunkt) || codepunkt < 0x20 || codepunkt > 0x10ffff) {
    return treffer;
  }
  try {
    return String.fromCodePoint(codepunkt);
  } catch {
    return treffer;
  }
}
