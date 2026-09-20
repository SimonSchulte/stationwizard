/**
 * Erfassungstoken für die öffentliche Kilometermeldung.
 *
 * Das Token ist das einzige Zugangsmerkmal des Pfades `/e/<token>`, der als
 * einziger Pfad des Workers ohne Cloudflare-Access-Sitzung erreichbar ist
 * (siehe `oeffentliche-erfassung.ts` und docs/konzept-fahrzeuge.md, Abschnitt
 * 10). Es ist damit ein Geheimnis und gehört weder in Logs noch in
 * Fehlertexte oder das Änderungsprotokoll.
 *
 * 16 Zufallsbytes als Kleinbuchstaben-Hex: 32 Zeichen, 128 Bit. Dieselbe Form
 * erzeugt die Rückfüllung in `migrations/0007_oeffentliche_meldung.sql`
 * (`lower(hex(randomblob(16)))`) – beide müssen zusammen geändert werden.
 */

export const ERFASSUNG_TOKEN_MUSTER = /^[0-9a-f]{32}$/;

export function erzeugeErfassungToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (wert) => wert.toString(16).padStart(2, '0')).join('');
}

/**
 * Vergleich ohne frühen Abbruch, damit die Laufzeit nicht verrät, wie viele
 * Zeichen eines geratenen Tokens stimmen.
 *
 * Bewusst eine eigene Schleife statt `crypto.subtle.timingSafeEqual`: das ist
 * eine workerd-Erweiterung und steht in der Node-Testumgebung von
 * `worker/vitest.config.ts` nicht zur Verfügung.
 *
 * Die Länge selbst ist kein Geheimnis – sie steht fest im Muster oben und auf
 * jedem gedruckten Aufkleber –, deshalb darf sie vorab geprüft werden.
 */
export function gleichInKonstanterZeit(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i += 1) {
    unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return unterschied === 0;
}
