import { toDataURL, toString as qrZuString } from 'qrcode';

/**
 * QR-Erzeugung, dynamisch importiert (analog `excel-lesen.ts`/`excel-schreiben.ts`)
 * durch die aufrufende Seite.
 *
 * Drei Ziele je Fahrzeug, mit unterschiedlichem Charakter (siehe
 * docs/konzept-fahrzeuge.md, Abschnitt 4 und 10):
 *
 * - `uebersichtUrl` und `kmUrl` tragen **kein Token**. Die Identität der
 *   Erfassung kommt ausschließlich aus der Access-Sitzung des Scannenden; diese
 *   Aufkleber sind fotografierbar und kein Geheimnis. Ziel sind die festen
 *   Kurzpfade `/f/<UUID>` und `/f/<UUID>/km`, die der Worker auf die aktuelle
 *   Hash-Route weiterleitet – ein gedruckter Aufkleber überlebt damit eine
 *   spätere Routenumstellung.
 * - `oeffentlichUrl` trägt ein **unerratbares Token**. Ohne Access-Sitzung ist
 *   es das einzige Zugangsmerkmal, und eine darüber abgegebene Meldung wird
 *   erst durch eine Freigabe zum Kilometerstand. Dieser Aufkleber ist ein
 *   Geheimnis: wer ihn hat, darf melden.
 */
export interface FahrzeugQrZiele {
  uebersichtUrl: string;
  kmUrl: string;
  /** `null`, solange für das Fahrzeug kein Erfassungstoken vorliegt. */
  oeffentlichUrl: string | null;
}

export function fahrzeugQrZiele(
  fahrzeugId: string,
  erfassungToken: string | null = null,
  basisUrl = window.location.origin,
): FahrzeugQrZiele {
  return {
    uebersichtUrl: `${basisUrl}/f/${fahrzeugId}`,
    kmUrl: `${basisUrl}/f/${fahrzeugId}/km`,
    oeffentlichUrl: erfassungToken ? `${basisUrl}/e/${erfassungToken}` : null,
  };
}

/** Für die Bildschirmanzeige: eine PNG-Data-URL je Ziel-URL. */
export async function erzeugeQrDataUrl(ziel: string): Promise<string> {
  return toDataURL(ziel, { margin: 1, width: 240 });
}

/** Für den Druckbogen: eine vektorielle SVG-Zeichenkette, skaliert sauber auf Papier. */
export async function erzeugeQrSvg(ziel: string): Promise<string> {
  return qrZuString(ziel, { type: 'svg', margin: 1 });
}
