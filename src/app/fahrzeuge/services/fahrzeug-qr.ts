import { toDataURL, toString as qrZuString } from 'qrcode';

/**
 * QR-Erzeugung, dynamisch importiert (analog `excel-lesen.ts`/`excel-schreiben.ts`)
 * durch die aufrufende Seite. Die Codes tragen kein Token: die Identität der
 * Kilometererfassung kommt ausschließlich aus der Access-Sitzung des Scannenden
 * (siehe docs/konzept-fahrzeuge.md, Abschnitt 4). Ziel sind die festen Kurzpfade
 * `/f/<UUID>` und `/f/<UUID>/km`, die der Worker auf die aktuelle Hash-Route
 * weiterleitet – ein gedruckter Aufkleber überlebt damit eine spätere
 * Routenumstellung.
 */
export interface FahrzeugQrZiele {
  uebersichtUrl: string;
  kmUrl: string;
}

export function fahrzeugQrZiele(
  fahrzeugId: string,
  basisUrl = window.location.origin,
): FahrzeugQrZiele {
  return {
    uebersichtUrl: `${basisUrl}/f/${fahrzeugId}`,
    kmUrl: `${basisUrl}/f/${fahrzeugId}/km`,
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
