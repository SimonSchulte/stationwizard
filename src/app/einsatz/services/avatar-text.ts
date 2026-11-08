/**
 * Text im Avatar einer Einsatzkraft: das Benutzerkürzel aus HiOrg, sonst die Initialen aus
 * „Nachname Vorname“ (Anfangsbuchstaben des ersten und letzten Namensteils; bei einem einzelnen
 * Namen die ersten zwei Buchstaben). Ohne Namen bleibt ein Fragezeichen.
 */
export function avatarText(name: string, kuerzel?: string | null): string {
  const eigenes = kuerzel?.trim();
  if (eigenes) return eigenes;
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return '?';
  if (teile.length === 1) return teile[0].slice(0, 2).toLocaleUpperCase('de');
  const erster = teile[0].charAt(0);
  const letzter = teile[teile.length - 1].charAt(0);
  return (erster + letzter).toLocaleUpperCase('de');
}
