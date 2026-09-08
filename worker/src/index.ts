import { pruefeAnmeldung, type AccessKonfiguration } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';

export interface Env extends AccessKonfiguration {
  ASSETS: Fetcher;
}

const LESENDE_METHODEN = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Eine Origin für SPA und APIs; Access wird auch auf direkten Worker-Aufrufen geprüft. */
export default {
  async fetch(anfrage: Request, umgebung: Env): Promise<Response> {
    const benutzer = await pruefeAnmeldung(anfrage, umgebung);
    if (benutzer instanceof Response) {
      return benutzer;
    }

    const url = new URL(anfrage.url);
    if (!LESENDE_METHODEN.has(anfrage.method)) {
      const ursprung = anfrage.headers.get('Origin');
      if (
        (ursprung !== null && ursprung !== url.origin) ||
        anfrage.headers.get('Sec-Fetch-Site') === 'cross-site'
      ) {
        return fehlerAntwort(
          'ANFRAGE_URSPRUNG_UNGUELTIG',
          'Schreibzugriffe sind nur aus dieser Anwendung erlaubt.',
          403,
        );
      }
    }

    if (url.pathname === '/api/benutzer' || url.pathname === '/api/status') {
      if (anfrage.method !== 'GET') {
        return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
          Allow: 'GET',
        });
      }
      return jsonAntwort(url.pathname === '/api/benutzer' ? benutzer : { status: 'erreichbar' });
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return fehlerAntwort('API_NICHT_GEFUNDEN', 'API-Endpunkt nicht gefunden.', 404);
    }

    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, HEAD',
      });
    }

    return umgebung.ASSETS.fetch(anfrage);
  },
} satisfies ExportedHandler<Env>;
