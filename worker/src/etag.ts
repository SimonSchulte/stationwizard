/**
 * ETag-Hilfen für die optimistische Sperre (`If-Match`) der eigenen D1-Module.
 *
 * Der Worker gibt seine Version immer als **starken** ETag aus (`"3"`). Zurück
 * kommt sie aber nicht zwangsläufig in derselben Form: Cloudflare wandelt einen
 * starken ETag in einen schwachen (`W/"3"`) um, sobald es die Antwort unterwegs
 * verändert – der Normalfall dafür ist die automatische Komprimierung. Das
 * Abschalten dieser Umwandlung („Respect Strong ETags") ist eine
 * Enterprise-Einstellung und steht diesem Betrieb auf dem kostenlosen Tarif
 * nicht zur Verfügung. Der Browser liest also `W/"3"`, schickt genau das als
 * `If-Match` zurück, und eine Prüfung auf ausschließlich starke ETags lehnt
 * damit **jedes** Speichern eines zuvor geladenen Datensatzes mit 428 ab.
 *
 * Genau das war der gemeldete Fehler „Zum Speichern zuerst laden und die
 * aktuelle Version mitsenden." – in workerd/Miniflare und in jedem Test mit
 * fest notiertem `"3"` unsichtbar, weil dort kein Cloudflare-Edge dazwischen
 * liegt, in Produktion dagegen ausnahmslos. Dass schwache ETags real vorkommen,
 * war im Projekt bereits bekannt: `nextcloud.ts` lässt sie beim Durchreichen
 * einer fremden Dateiversion ausdrücklich zu.
 *
 * Die Sperre wird dadurch nicht schwächer: verglichen wird weiterhin die exakte
 * Versionsnummer (`WHERE id = ? AND version = ?`), ein veralteter Stand ergibt
 * unverändert 412. Übernommen wird nur die Erkenntnis, dass die Form, in der
 * die Zahl zurückkommt, nicht in unserer Hand liegt.
 */

// Starker (`"3"`) oder schwacher (`W/"3"`) ETag; der Inhalt folgt der
// etagc-Zeichenmenge aus RFC 9110, schließt also das Anführungszeichen aus.
const ETAG_MUSTER = /^(?:W\/)?"([\x21\x23-\x7e\x80-\xff]*)"$/;

export function starkesEtag(version: number): string {
  return `"${version}"`;
}

/**
 * Versionsnummer aus einem starken oder schwachen ETag, sonst `null`.
 * Bewusst nur reine Ziffern: `Number()` nähme sonst auch `0x10` oder `1e3` an.
 */
export function versionAusEtag(wert: string): number | null {
  const inhalt = ETAG_MUSTER.exec(wert)?.[1];
  if (inhalt === undefined || !/^\d+$/.test(inhalt)) {
    return null;
  }
  const version = Number(inhalt);
  return Number.isSafeInteger(version) && version >= 1 ? version : null;
}
