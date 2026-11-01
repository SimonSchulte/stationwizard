import { UUID_MUSTER } from './json-lesen';

/**
 * Gedruckte QR-Codes zeigen auf feste Kurzpfade statt auf die Hash-Route
 * (siehe docs/konzept-fahrzeuge.md, Abschnitt 4): ändert sich das
 * Angular-Routing, ändert sich nur diese eine Stelle, nicht jeder Aufkleber.
 * Nur GET; Access-Prüfung erfolgt bereits vorher im Router.
 */
export function kurzlinkWeiterleitung(pfad: string): Response | null {
  const uebersicht = new RegExp(`^/f/(${UUID_MUSTER})$`, 'i').exec(pfad);
  if (uebersicht) {
    return neueWeiterleitung(`/#/fahrzeuge/${uebersicht[1]}`);
  }
  const km = new RegExp(`^/f/(${UUID_MUSTER})/km$`, 'i').exec(pfad);
  if (km) {
    // Kennzeichnet die Erfassung als über den gedruckten Aufkleber ausgelöst,
    // damit das Feld `quelle` einer Ablesung nicht geraten werden muss.
    return neueWeiterleitung(`/#/fahrzeuge/${km[1]}/km?quelle=qr`);
  }
  return null;
}

function neueWeiterleitung(ziel: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: ziel, 'Cache-Control': 'no-store' },
  });
}
