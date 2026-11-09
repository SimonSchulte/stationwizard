/** Vergleichsform eines Lagers: ohne Groß-/Kleinschreibung und überzählige Leerzeichen. */
export function lagerSchluessel(lagerort: string): string {
  return lagerort.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
}

/**
 * Vorschläge für das Feld „Von (Lagerort)“: alle bereits erfassten Lager, je Vergleichsform
 * einmal (mit der Schreibweise des ersten Vorkommens), alphabetisch. So entsteht keine zweite
 * Schreibweise desselben Lagers.
 */
export function lagerVorschlaege(
  abschnitte: readonly { laufzettel: readonly { lagerort: string }[] }[],
): string[] {
  const gesehen = new Map<string, string>();
  for (const abschnitt of abschnitte) {
    for (const { lagerort } of abschnitt.laufzettel) {
      const schluessel = lagerSchluessel(lagerort);
      if (schluessel !== '' && !gesehen.has(schluessel)) {
        gesehen.set(schluessel, lagerort.trim().replace(/\s+/g, ' '));
      }
    }
  }
  return [...gesehen.values()].sort((a, b) => a.localeCompare(b, 'de'));
}
