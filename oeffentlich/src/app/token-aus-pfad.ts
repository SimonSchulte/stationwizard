/**
 * Muster und Zerlegung des öffentlichen Pfades `/e/<token>`.
 *
 * Wortgleich mit `ERFASSUNG_TOKEN_MUSTER` in `worker/src/erfassung-token.ts`:
 * beide beschreiben dieselbe 32-stellige Hex-Form und werden gemeinsam
 * geändert. Die Prüfung hier erspart einen aussichtslosen Serveraufruf; sie
 * ersetzt die Prüfung im Worker nicht.
 */
export const ERFASSUNG_TOKEN_MUSTER = /^[0-9a-f]{32}$/;

export function tokenAusPfad(pfad: string): string | null {
  const treffer = /^\/e\/([0-9a-f]{32})$/.exec(pfad);
  return treffer?.[1] ?? null;
}
