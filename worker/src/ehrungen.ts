import { type Benutzer } from './anmeldung';
import { fehlerAntwort } from './antwort';
import { type EhrungenKonfiguration } from './ehrungen-gemeinsam';
import { importiere } from './ehrungen-import';
import { aktualisiere, liste, loesche, verlauf } from './ehrungen-personen';
import { vorgaengeListe, vorgangSetzen } from './ehrungen-vorgaenge';
import { zustaendigkeitSetzen } from './ehrungen-zustaendigkeit';
import { UUID_MUSTER } from './json-lesen';

/**
 * Ehrungen im Personalmodul: Leistungsabzeichen, Jubiläumszeichen und
 * Ehrenzeichen je Person (`src/app/personal/pages/ehrungen/`). Gespeichert wird
 * nur, was Menschen erfassen oder aus dem Stundenimport stammt – Stunden,
 * Eintrittsdatum, „Besondere Verdienste" und die bereits erhaltenen
 * Auszeichnungen. Was fällig ist, berechnet der Client daraus und speichert es
 * nie. Eine Zeile je Person in `ehrungen_personen` (BENUTZER_DB, Migration 0014)
 * mit eigener Version.
 *
 * Rechte vorerst alle, Rollen später: jede geprüfte Identität darf lesen und
 * schreiben, wie bei den übrigen Fachmodulen.
 */
export const EHRUNGEN_PFAD = '/api/personal/ehrungen';
const EHRUNGEN_IMPORT_PFAD = '/api/personal/ehrungen/import';
const EINZEL_PFAD = new RegExp(`^${EHRUNGEN_PFAD}/(${UUID_MUSTER})$`, 'i');
const VERLAUF_PFAD = new RegExp(`^${EHRUNGEN_PFAD}/(${UUID_MUSTER})/aenderungen$`, 'i');
const VORGANG_PFAD = new RegExp(`^${EHRUNGEN_PFAD}/(${UUID_MUSTER})/vorgaenge/([a-z0-9-]+)$`, 'i');
const VORGAENGE_LISTE_PFAD = '/api/personal/ehrungen/vorgaenge';
const ZUSTAENDIGKEIT_PFAD = new RegExp(`^${EHRUNGEN_PFAD}/(${UUID_MUSTER})/zustaendigkeit$`, 'i');
/** Feste Ehrungen-Endpunkte hinter der bereits geprüften Anmeldung. */
export async function verarbeiteEhrungen(
  anfrage: Request,
  umgebung: EhrungenKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.BENUTZER_DB;
  if (!db) {
    return fehlerAntwort(
      'EHRUNGEN_KONFIGURATION_FEHLT',
      'Die Ehrungen sind noch nicht eingerichtet.',
      503,
    );
  }
  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('EHRUNGEN_PFAD_UNGUELTIG', 'Ehrungen-Endpunkt nicht gefunden.', 404);
  }
  const nichtErlaubt = (erlaubt: string) =>
    fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: erlaubt });

  try {
    if (url.pathname === EHRUNGEN_PFAD) {
      return anfrage.method === 'GET' ? await liste(db) : nichtErlaubt('GET');
    }
    if (url.pathname === VORGAENGE_LISTE_PFAD) {
      return anfrage.method === 'GET' ? await vorgaengeListe(db) : nichtErlaubt('GET');
    }
    const vorgang = VORGANG_PFAD.exec(url.pathname);
    if (vorgang?.[1] && vorgang[2]) {
      return anfrage.method === 'PUT'
        ? await vorgangSetzen(anfrage, db, vorgang[1], vorgang[2], identitaet)
        : nichtErlaubt('PUT');
    }
    const zustaendigkeitId = ZUSTAENDIGKEIT_PFAD.exec(url.pathname)?.[1];
    if (zustaendigkeitId) {
      return anfrage.method === 'PUT'
        ? await zustaendigkeitSetzen(anfrage, db, zustaendigkeitId, identitaet)
        : nichtErlaubt('PUT');
    }
    if (url.pathname === EHRUNGEN_IMPORT_PFAD) {
      return anfrage.method === 'POST'
        ? await importiere(anfrage, db, identitaet)
        : nichtErlaubt('POST');
    }
    const verlaufId = VERLAUF_PFAD.exec(url.pathname)?.[1];
    if (verlaufId) {
      return anfrage.method === 'GET' ? await verlauf(db, verlaufId) : nichtErlaubt('GET');
    }
    const id = EINZEL_PFAD.exec(url.pathname)?.[1];
    if (id) {
      if (anfrage.method === 'PUT') return await aktualisiere(anfrage, db, id, identitaet);
      if (anfrage.method === 'DELETE') return await loesche(db, id);
      return nichtErlaubt('PUT, DELETE');
    }
    return fehlerAntwort('EHRUNGEN_PFAD_UNGUELTIG', 'Ehrungen-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('EHRUNGEN_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'EHRUNGEN_DB_FEHLER',
      'Die Ehrungen konnten nicht verarbeitet werden.',
      502,
    );
  }
}
