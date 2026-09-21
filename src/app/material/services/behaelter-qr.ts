/**
 * QR-Ziel des öffentlichen Fahrzeugchecks.
 *
 * Anders als die Fahrzeug-Kurzlinks `/f/<UUID>` trägt dieser Aufkleber ein
 * **unerratbares Token**: ohne Access-Sitzung ist es das einzige
 * Zugangsmerkmal. Er ist damit ein Geheimnis – wer ihn hat, darf eine Prüfung
 * melden. Eine so abgegebene Meldung wird erst durch eine Freigabe zum Check.
 *
 * `qrcode` wird von der aufrufenden Seite dynamisch importiert, damit die
 * Bibliothek nicht im Startbündel landet (wie bei `fahrzeug-qr.ts`).
 */

/**
 * Die produktive Domain. Gedruckte Aufkleber sollen unabhängig davon
 * funktionieren, von welchem Ursprung aus sie erzeugt wurden – insbesondere
 * nicht von einem `workers.dev`- oder Vorschau-Worker, wo der öffentliche
 * Bypass für `/c/<TOKEN>` bewusst nicht greift (siehe CLAUDE.md).
 */
const PRODUKTIVE_BASIS_URL = 'https://hiorg-wache.com';

/** `null`, solange für den Behälter kein Prüftoken vorliegt. */
export function behaelterCheckUrl(
  token: string | null,
  basisUrl = PRODUKTIVE_BASIS_URL,
): string | null {
  return token ? `${basisUrl}/c/${token}` : null;
}
