import { pruefeAnmeldung, type AccessKonfiguration } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  registriereZugriff,
  verarbeiteBenutzerverwaltung,
  type BenutzerverwaltungKonfiguration,
} from './benutzer';
import { verarbeiteEfs, type EfsKonfiguration } from './efs';
import {
  kurzlinkWeiterleitung,
  verarbeiteFahrzeuge,
  type FahrzeugeKonfiguration,
} from './fahrzeuge';
import { verarbeiteHiorgKalender, type HiorgKalenderKonfiguration } from './hiorg-kalender';
import {
  KM_BERICHT_PFAD,
  KM_BERICHT_SENDEN_PFAD,
  verarbeiteKmBericht,
  type KmBerichtKonfiguration,
} from './km-bericht';
import { verarbeiteNextcloud, type NextcloudKonfiguration } from './nextcloud';
import {
  istOeffentlicherPfad,
  verarbeiteOeffentlicheErfassung,
  type OeffentlicheErfassungKonfiguration,
} from './oeffentliche-erfassung';
import { PROFILBILD_PFAD, verarbeiteProfilbild } from './profilbild';
import {
  SYSTEMKONFIGURATION_PFAD,
  verarbeiteSystemkonfiguration,
  type SystemkonfigurationKonfiguration,
} from './systemkonfiguration';

export interface Env
  extends
    AccessKonfiguration,
    NextcloudKonfiguration,
    EfsKonfiguration,
    HiorgKalenderKonfiguration,
    FahrzeugeKonfiguration,
    BenutzerverwaltungKonfiguration,
    SystemkonfigurationKonfiguration,
    KmBerichtKonfiguration,
    OeffentlicheErfassungKonfiguration {
  ASSETS: Fetcher;
}

const LESENDE_METHODEN = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Eine Origin für SPA und APIs; Access wird auch auf direkten Worker-Aufrufen geprüft. */
export default {
  async fetch(anfrage: Request, umgebung: Env): Promise<Response> {
    const url = new URL(anfrage.url);

    // Die einzige Ausnahme vom Access-Gate, fachlich beauftragt und bewusst
    // eng: drei feste Pfadmuster der öffentlichen Kilometermeldung, jede
    // Fachanfrage an ein unerratbares Zufallstoken je Fahrzeug gebunden
    // (docs/konzept-fahrzeuge.md, Abschnitt 10; die zugehörige
    // Access-Bypass-Regel steht in docs/einrichtung.md).
    //
    // Kein Entwicklungsschalter, kein festes Testtoken, kein Vertrauen in einen
    // Header: die App-Hülle, sämtliche übrigen Assets und alle anderen
    // /api/*-Pfade bleiben vollständig hinter der Anmeldung. Der Worker prüft
    // das Muster unabhängig von Access – eine zu weit gefasste Access-Regel
    // macht die Anwendung deshalb trotzdem nicht öffentlich.
    if (istOeffentlicherPfad(url.pathname)) {
      return verarbeiteOeffentlicheErfassung(anfrage, umgebung, url);
    }

    const benutzer = await pruefeAnmeldung(anfrage, umgebung);
    if (benutzer instanceof Response) {
      return benutzer;
    }

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
      if (url.pathname === '/api/benutzer' && umgebung.BENUTZER_DB) {
        // Die Shell ruft diesen Endpunkt einmal je Sitzungsstart ab; das
        // genügt, um "letzter Zugriff" aktuell zu halten. Ein Fehler hier
        // darf die eigentliche Antwort nicht verhindern.
        try {
          await registriereZugriff(umgebung.BENUTZER_DB, benutzer.email);
        } catch (ursache) {
          console.error('BENUTZER_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
        }
      }
      return jsonAntwort(url.pathname === '/api/benutzer' ? benutzer : { status: 'erreichbar' });
    }

    if (url.pathname === PROFILBILD_PFAD) {
      return verarbeiteProfilbild(anfrage);
    }

    if (
      url.pathname === '/api/benutzerverwaltung' ||
      url.pathname.startsWith('/api/benutzerverwaltung/')
    ) {
      return verarbeiteBenutzerverwaltung(anfrage, umgebung, benutzer);
    }

    if (url.pathname === SYSTEMKONFIGURATION_PFAD) {
      return verarbeiteSystemkonfiguration(anfrage, umgebung, benutzer);
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

    // Vor der Fahrzeugverarbeitung, weil der Bericht kein einzelnes Fahrzeug
    // adressiert und deren UUID-Pfade ihn sonst als unbekannt abwiesen.
    if (url.pathname === KM_BERICHT_PFAD || url.pathname === KM_BERICHT_SENDEN_PFAD) {
      return verarbeiteKmBericht(anfrage, umgebung, benutzer);
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
