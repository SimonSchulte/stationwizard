/**
 * Gruppenfilter über `gruppen_namen` der HiOrg-Server-API (bei uns `HiorgPerson.gruppen`).
 * Die Werte sind Freitext aus HiOrg; es gibt keine feste Liste, der Filter bietet genau die
 * gefundenen Gruppen an.
 */

/** Alle vorkommenden Gruppennamen, alphabetisch und ohne Dopplungen. */
export function gruppenSammeln(
  personen: readonly { readonly gruppen: readonly string[] }[],
): string[] {
  const alle = new Set<string>();
  for (const person of personen) {
    for (const gruppe of person.gruppen) {
      const name = gruppe.trim();
      if (name) alle.add(name);
    }
  }
  return [...alle].sort((a, b) => a.localeCompare(b, 'de'));
}

/** Leere Auswahl heißt: kein Filter. Sonst genügt eine übereinstimmende Gruppe der Person. */
export function passtZuGruppen(gruppen: readonly string[], auswahl: readonly string[]): boolean {
  if (auswahl.length === 0) return true;
  return gruppen.some((gruppe) => auswahl.includes(gruppe.trim()));
}
