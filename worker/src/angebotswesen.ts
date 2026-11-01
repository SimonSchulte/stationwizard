import {
  aktualisiereAngebot,
  legeAngebotAn,
  leseAngebot,
  listeAngebote,
  loescheAngebot,
} from './angebotswesen-angebote';
import { type AngebotswesenKonfiguration } from './angebotswesen-gemeinsam';
import {
  aktualisierePreiskatalogEintrag,
  legePreiskatalogEintragAn,
  listePreiskatalog,
  loeschePreiskatalogEintrag,
} from './angebotswesen-preiskatalog';
import { type Benutzer } from './anmeldung';
import { fehlerAntwort } from './antwort';
import { UUID_MUSTER } from './json-lesen';

/**
 * Angebotswesen (AP-A1): Preiskatalog und Angebote liegen in einer eigenen
 * D1-Datenbank (ANGEBOTSWESEN_DB), getrennt von FAHRZEUGE_DB/BENUTZER_DB –
 * eigene Fachdomäne, eigene Datenbank (siehe CLAUDE.md).
 *
 * Rechte vorerst alle, Rollen später: wie ursprünglich bei
 * Fahrzeugen/Benutzerverwaltung/Systemkonfiguration darf jede geprüfte
 * Identität den Preiskatalog und Angebote lesen und schreiben. Eine spätere
 * Admin-Rolle soll dies einschränken.
 */
const PREISKATALOG_LISTE_PFAD = '/api/angebotswesen/preiskatalog';
const PREISKATALOG_PFAD = new RegExp(`^/api/angebotswesen/preiskatalog/(${UUID_MUSTER})$`, 'i');
const ANGEBOTE_LISTE_PFAD = '/api/angebotswesen/angebote';
const ANGEBOT_PFAD = new RegExp(`^/api/angebotswesen/angebote/(${UUID_MUSTER})$`, 'i');
/**
 * Feste Angebotswesen-Endpunkte hinter der bereits geprüften Anmeldung. Kein
 * generischer Abfrageendpunkt: keine Query-Parameter, keine frei wählbaren
 * Pfade. `identitaet` stammt ausschließlich aus dem verifizierten Access-JWT.
 */
export async function verarbeiteAngebotswesen(
  anfrage: Request,
  umgebung: AngebotswesenKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.ANGEBOTSWESEN_DB;
  if (!db) {
    return fehlerAntwort(
      'ANGEBOTSWESEN_KONFIGURATION_FEHLT',
      'Das Angebotswesen ist noch nicht eingerichtet.',
      503,
    );
  }

  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort(
      'ANGEBOTSWESEN_PFAD_UNGUELTIG',
      'Angebotswesen-Endpunkt nicht gefunden.',
      404,
    );
  }

  try {
    if (url.pathname === PREISKATALOG_LISTE_PFAD) {
      if (anfrage.method === 'GET') return await listePreiskatalog(db);
      if (anfrage.method === 'POST')
        return await legePreiskatalogEintragAn(anfrage, db, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    const preiskatalogId = PREISKATALOG_PFAD.exec(url.pathname)?.[1];
    if (preiskatalogId) {
      if (anfrage.method === 'PUT')
        return await aktualisierePreiskatalogEintrag(anfrage, db, preiskatalogId, identitaet);
      if (anfrage.method === 'DELETE') return await loeschePreiskatalogEintrag(db, preiskatalogId);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'PUT, DELETE',
      });
    }

    if (url.pathname === ANGEBOTE_LISTE_PFAD) {
      if (anfrage.method === 'GET') return await listeAngebote(db);
      if (anfrage.method === 'POST') return await legeAngebotAn(anfrage, db, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    const angebotId = ANGEBOT_PFAD.exec(url.pathname)?.[1];
    if (angebotId) {
      if (anfrage.method === 'GET') return await leseAngebot(db, angebotId);
      if (anfrage.method === 'PUT')
        return await aktualisiereAngebot(anfrage, db, angebotId, identitaet);
      if (anfrage.method === 'DELETE') return await loescheAngebot(db, angebotId);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, PUT, DELETE',
      });
    }

    return fehlerAntwort(
      'ANGEBOTSWESEN_PFAD_UNGUELTIG',
      'Angebotswesen-Endpunkt nicht gefunden.',
      404,
    );
  } catch (ursache) {
    console.error('ANGEBOTSWESEN_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'ANGEBOTSWESEN_DB_FEHLER',
      'Die Angebotswesen-Daten konnten nicht verarbeitet werden.',
      502,
    );
  }
}
