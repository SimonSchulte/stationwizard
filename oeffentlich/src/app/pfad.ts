/**
 * Muster und Zerlegung der beiden öffentlichen Pfade.
 *
 * Wortgleich mit `ERFASSUNG_TOKEN_MUSTER` in `worker/src/erfassung-token.ts`
 * und mit den Mustern in `OEFFENTLICHE_MUSTER`
 * (`worker/src/oeffentliche-erfassung.ts`): alle beschreiben dieselbe
 * 32-stellige Hex-Form und werden gemeinsam geändert. Die Prüfung hier erspart
 * einen aussichtslosen Serveraufruf; sie ersetzt die Prüfung im Worker nicht.
 */
export const ERFASSUNG_TOKEN_MUSTER = /^[0-9a-f]{32}$/;

/** `/e/<token>` – Kilometermeldung. */
export function tokenAusPfad(pfad: string): string | null {
  const treffer = /^\/e\/([0-9a-f]{32})$/.exec(pfad);
  return treffer?.[1] ?? null;
}

/** `/c/<token>` – Fahrzeugcheck. */
export function checkTokenAusPfad(pfad: string): string | null {
  const treffer = /^\/c\/([0-9a-f]{32})$/.exec(pfad);
  return treffer?.[1] ?? null;
}
