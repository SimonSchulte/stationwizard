import { fehlerAntwort } from './antwort';

/**
 * Gemeinsamer Schutz beider öffentlichen Erfassungswege (Kilometermeldung und
 * Fahrzeugcheck). Liegt getrennt, damit `oeffentlicher-check.ts` ihn nutzen kann,
 * ohne `oeffentliche-erfassung.ts` zu importieren, das wiederum den Check verteilt.
 */

/** Header jeder öffentlichen Antwort. */
export const SCHUTZ_HEADER: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * Die Ursprungsprüfung aus `index.ts` läuft vor diesem Zweig nicht – sie steht
 * dort hinter `pruefeAnmeldung`. Hier ist sie strenger als die globale: ein
 * fehlender `Origin` wird nicht geduldet, weil die Meldung garantiert aus einem
 * Browser derselben Origin abgeschickt wird.
 */
export function pruefeUrsprung(anfrage: Request, url: URL): Response | null {
  const ursprung = anfrage.headers.get('Origin');
  const site = anfrage.headers.get('Sec-Fetch-Site');
  if (ursprung !== url.origin || (site !== null && site !== 'same-origin')) {
    return fehlerAntwort(
      'ANFRAGE_URSPRUNG_UNGUELTIG',
      'Meldungen sind nur aus dieser Anwendung erlaubt.',
      403,
      SCHUTZ_HEADER,
    );
  }
  return null;
}
