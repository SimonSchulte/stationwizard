import { pruefeAnmeldung, type AccessKonfiguration } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { verarbeiteEfs, type EfsKonfiguration } from './efs';
import {
  kurzlinkWeiterleitung,
  verarbeiteFahrzeuge,
  type FahrzeugeKonfiguration,
} from './fahrzeuge';
import { verarbeiteHiorgKalender, type HiorgKalenderKonfiguration } from './hiorg-kalender';
import { verarbeiteNextcloud, type NextcloudKonfiguration } from './nextcloud';

export interface Env
  extends
    AccessKonfiguration,
    NextcloudKonfiguration,
    EfsKonfiguration,
    HiorgKalenderKonfiguration,
    FahrzeugeKonfiguration {
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

    if (url.pathname.startsWith('/api/efs/')) {
      return verarbeiteEfs(anfrage, umgebung);
    }

    if (url.pathname.startsWith('/api/hiorg/')) {
      return verarbeiteHiorgKalender(anfrage, umgebung);
    }

    if (url.pathname.startsWith('/api/nextcloud/')) {
      return verarbeiteNextcloud(anfrage, umgebung);
    }

    if (url.pathname === '/api/fahrzeuge' || url.pathname.startsWith('/api/fahrzeuge/')) {
      return verarbeiteFahrzeuge(anfrage, umgebung, benutzer);
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return fehlerAntwort('API_NICHT_GEFUNDEN', 'API-Endpunkt nicht gefunden.', 404);
    }

    // Gedruckte QR-Codes zeigen auf feste Kurzpfade statt auf die Hash-Route,
    // damit sie eine spätere Routenumstellung überleben (siehe
    // docs/konzept-fahrzeuge.md, Abschnitt 4). Access ist bereits geprüft.
    if (anfrage.method === 'GET' && url.pathname.startsWith('/f/')) {
      const weiterleitung = kurzlinkWeiterleitung(url.pathname);
      if (weiterleitung) return weiterleitung;
      return fehlerAntwort('FAHRZEUGE_KURZLINK_UNGUELTIG', 'Unbekannter Kurzlink.', 404);
    }

    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, HEAD',
      });
    }

    return umgebung.ASSETS.fetch(anfrage);
  },
} satisfies ExportedHandler<Env>;
