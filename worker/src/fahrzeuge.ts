import { fehlerAntwort } from './antwort';
import {
  ergaenzeAblesung,
  listeAblesungen,
  listeAenderungen,
  loescheAblesung,
} from './fahrzeuge-ablesungen';
import {
  erneuereErfassungslink,
  leseErfassungslink,
  listeErfassungslinks,
} from './fahrzeuge-erfassungslinks';
import { type FahrzeugeKonfiguration, type GeprueftesBenutzerkonto } from './fahrzeuge-gemeinsam';
import {
  aktualisiereFahrzeug,
  legeFahrzeugAn,
  leseFahrzeug,
  listeFahrzeuge,
} from './fahrzeuge-stammdaten';
import { UUID_MUSTER } from './json-lesen';

const FAHRZEUG_LISTE_PFAD = '/api/fahrzeuge';
const FAHRZEUG_PFAD = new RegExp(`^/api/fahrzeuge/(${UUID_MUSTER})$`, 'i');
const ABLESUNGEN_PFAD = new RegExp(`^/api/fahrzeuge/(${UUID_MUSTER})/ablesungen$`, 'i');
const ABLESUNG_PFAD = new RegExp(
  `^/api/fahrzeuge/(${UUID_MUSTER})/ablesungen/(${UUID_MUSTER})$`,
  'i',
);
const AENDERUNGEN_PFAD = new RegExp(`^/api/fahrzeuge/(${UUID_MUSTER})/aenderungen$`, 'i');
const ERFASSUNGSLINKS_PFAD = '/api/fahrzeuge/erfassungslinks';
const ERFASSUNGSLINK_PFAD = new RegExp(`^/api/fahrzeuge/(${UUID_MUSTER})/erfassungslink$`, 'i');
/**
 * Feste Fahrzeug-Endpunkte hinter der bereits geprüften Anmeldung. Kein
 * generischer Abfrageendpunkt: keine Query-Parameter, keine frei wählbaren
 * Pfade. `identitaet` stammt ausschließlich aus dem verifizierten Access-JWT
 * und wird nie aus dem Anfragekörper übernommen.
 */
export async function verarbeiteFahrzeuge(
  anfrage: Request,
  umgebung: FahrzeugeKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const db = umgebung.FAHRZEUGE_DB;
  if (!db) {
    return fehlerAntwort(
      'FAHRZEUGE_KONFIGURATION_FEHLT',
      'Das Fahrzeugmodul ist noch nicht eingerichtet.',
      503,
    );
  }

  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('FAHRZEUGE_PFAD_UNGUELTIG', 'Fahrzeuge-Endpunkt nicht gefunden.', 404);
  }

  try {
    if (url.pathname === FAHRZEUG_LISTE_PFAD) {
      if (anfrage.method === 'GET') return await listeFahrzeuge(db);
      if (anfrage.method === 'POST') return await legeFahrzeugAn(anfrage, db, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    // Ausdrücklich vor der UUID-Regex geprüft, auch wenn "erfassungslinks" sie
    // ohnehin nicht trifft – dieselbe Vorsicht wie bei KM_BERICHT_PFAD.
    if (url.pathname === ERFASSUNGSLINKS_PFAD) {
      if (anfrage.method === 'GET') return await listeErfassungslinks(db, umgebung, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    const linkFahrzeugId = ERFASSUNGSLINK_PFAD.exec(url.pathname)?.[1];
    if (linkFahrzeugId) {
      if (anfrage.method === 'GET') return await leseErfassungslink(db, linkFahrzeugId);
      if (anfrage.method === 'POST')
        return await erneuereErfassungslink(db, umgebung, linkFahrzeugId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    const fahrzeugId = FAHRZEUG_PFAD.exec(url.pathname)?.[1];
    if (fahrzeugId) {
      if (anfrage.method === 'GET') return await leseFahrzeug(db, fahrzeugId);
      if (anfrage.method === 'PUT')
        return await aktualisiereFahrzeug(anfrage, db, fahrzeugId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, PUT',
      });
    }

    const ablesungTreffer = ABLESUNG_PFAD.exec(url.pathname);
    const ablesungFahrzeugId = ablesungTreffer?.[1];
    const ablesungId = ablesungTreffer?.[2];
    if (ablesungFahrzeugId && ablesungId) {
      if (anfrage.method === 'DELETE')
        return await loescheAblesung(db, ablesungFahrzeugId, ablesungId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'DELETE',
      });
    }

    const ablesungenFahrzeugId = ABLESUNGEN_PFAD.exec(url.pathname)?.[1];
    if (ablesungenFahrzeugId) {
      if (anfrage.method === 'GET') return await listeAblesungen(db, ablesungenFahrzeugId);
      if (anfrage.method === 'POST')
        return await ergaenzeAblesung(anfrage, db, ablesungenFahrzeugId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    const aenderungenFahrzeugId = AENDERUNGEN_PFAD.exec(url.pathname)?.[1];
    if (aenderungenFahrzeugId) {
      if (anfrage.method === 'GET') return await listeAenderungen(db, aenderungenFahrzeugId);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    return fehlerAntwort('FAHRZEUGE_PFAD_UNGUELTIG', 'Fahrzeuge-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('FAHRZEUGE_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'FAHRZEUGE_DB_FEHLER',
      'Die Fahrzeugdaten konnten nicht verarbeitet werden.',
      502,
    );
  }
}
