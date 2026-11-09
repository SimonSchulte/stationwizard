/** Unsichtbares Leerzeichen ohne Breite: erlaubt pdfmake einen Umbruch an dieser Stelle. */
const UMBRUCHSTELLE = '​';

/**
 * Harter Zeichenumbruch für zu lange Wörter. pdfmake bricht nur an Leerzeichen und Bindestrichen;
 * ein längeres Wort macht die Spalte so breit wie das Wort selbst und läuft über den Streifen.
 * Jedes Wortstück (an Leerzeichen, „-“ und „/“ getrennt), das länger als `maxZeichen` ist,
 * erhält zwischen allen Zeichen eine Umbruchstelle; kürzere Wörter bleiben unverändert. Der
 * sichtbare Text ändert sich nicht.
 */
export function harterUmbruch(text: string, maxZeichen: number): string {
  if (maxZeichen < 1) return text;
  return text.replace(/\S+/g, (wort) =>
    wort
      .split(/(?<=[-/])/)
      .map((stueck) => ([...stueck].length > maxZeichen ? [...stueck].join(UMBRUCHSTELLE) : stueck))
      .join(''),
  );
}
