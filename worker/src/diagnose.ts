/** Gemeinsame Diagnosehilfen für Upstream-Aufrufe; niemals Zugangsdaten veröffentlichen. */

/** Fehlerklasse und Meldung der Laufzeit; keine Header, kein Antwortinhalt. */
export function ursachenText(ursache: unknown): string {
  if (ursache instanceof Error) return `${ursache.name}: ${ursache.message}`;
  return typeof ursache;
}

/** Konfigurierte Adresse und Zugangsdaten aus einem Diagnosetext entfernen. */
export function redigiere(text: string, geheim: (string | undefined)[]): string {
  let ergebnis = text;
  for (const wert of geheim) {
    if (wert) ergebnis = ergebnis.split(wert).join('<redigiert>');
  }
  return ergebnis;
}

export function hostname(basisUrl: string): string | undefined {
  try {
    return new URL(basisUrl).hostname;
  } catch {
    return undefined;
  }
}

/** Mit redirect: 'manual' liefert die Laufzeit die Weiterleitung als echten 3xx-Status. */
export function istUmleitung(antwort: Response): boolean {
  return antwort.status >= 300 && antwort.status <= 399;
}
