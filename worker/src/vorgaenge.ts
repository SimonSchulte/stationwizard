import { fehlerAntwort, jsonAntwort } from './antwort';
import { UUID_MUSTER } from './json-lesen';
import { entferneAngebot, legeAngebotAn, liefereAngebot } from './vorgaenge-angebote';
import { leseAufgaben, leseVorgang, listeVorgaenge } from './vorgaenge-lesen';
import { sendeMeldung } from './vorgaenge-einreichen';
import { legeVorgangAn, speichereMeldung, wechsleStufe } from './vorgaenge-schreiben';
import {
  entferneAlleUnterschriften,
  entferneUnterschrift,
  istSlot,
  setzeUnterschrift,
} from './vorgaenge-unterschriften';
import type { GeprueftesBenutzerkonto, VorgaengeKonfiguration } from './vorgaenge-gemeinsam';

export const VORGAENGE_PFAD = '/api/vorgaenge';
const AUFGABEN_PFAD = '/api/vorgaenge/aufgaben';
const VORGANG_PFAD = new RegExp(`^/api/vorgaenge/(${UUID_MUSTER})$`, 'i');
const MELDUNG_PFAD = new RegExp(`^/api/vorgaenge/(${UUID_MUSTER})/meldung$`, 'i');
const EINREICHEN_PFAD = new RegExp(`^/api/vorgaenge/(${UUID_MUSTER})/einreichen$`, 'i');
const ANGEBOT_PFAD = new RegExp(`^/api/vorgaenge/(${UUID_MUSTER})/angebote/(${UUID_MUSTER})$`, 'i');
const STUFE_PFAD = new RegExp(`^/api/vorgaenge/(${UUID_MUSTER})/stufe$`, 'i');
const UNTERSCHRIFTEN_PFAD = new RegExp(
  `^/api/vorgaenge/(${UUID_MUSTER})/meldung/unterschriften$`,
  'i',
);
const UNTERSCHRIFT_PFAD = new RegExp(
  `^/api/vorgaenge/(${UUID_MUSTER})/meldung/unterschriften/([a-z]+)$`,
  'i',
);

function methodeNichtErlaubt(erlaubt: string): Response {
  return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: erlaubt });
}

/**
 * Feste Vorgänge-Endpunkte hinter der bereits geprüften Anmeldung (Konzept:
 * `docs/konzept-vorgaenge.md`). Kein generischer Abfrageendpunkt; `identitaet` stammt
 * ausschließlich aus dem verifizierten Access-JWT.
 */
export async function verarbeiteVorgaenge(
  anfrage: Request,
  umgebung: VorgaengeKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const db = umgebung.FAHRZEUGE_DB;
  if (!db) {
    return fehlerAntwort(
      'VORGANG_KONFIGURATION_FEHLT',
      'Die Vorgänge sind noch nicht eingerichtet.',
      503,
    );
  }
  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('VORGANG_PFAD_UNGUELTIG', 'Vorgänge-Endpunkt nicht gefunden.', 404);
  }
  const pfad = url.pathname;
  const methode = anfrage.method;

  try {
    if (pfad === VORGAENGE_PFAD) {
      if (methode === 'GET') return await listeVorgaenge(db);
      if (methode === 'POST') return await legeVorgangAn(anfrage, db, identitaet);
      return methodeNichtErlaubt('GET, POST');
    }
    if (pfad === AUFGABEN_PFAD) {
      if (methode !== 'GET') return methodeNichtErlaubt('GET');
      const aufgaben = await leseAufgaben(db, umgebung, identitaet.email);
      return jsonAntwort(aufgaben);
    }

    const vorgang = VORGANG_PFAD.exec(pfad)?.[1];
    if (vorgang) {
      if (methode === 'GET') return await leseVorgang(db, vorgang);
      return methodeNichtErlaubt('GET');
    }
    const meldung = MELDUNG_PFAD.exec(pfad)?.[1];
    if (meldung) {
      if (methode === 'PUT') return await speichereMeldung(anfrage, db, meldung, identitaet);
      return methodeNichtErlaubt('PUT');
    }
    const stufe = STUFE_PFAD.exec(pfad)?.[1];
    if (stufe) {
      if (methode === 'POST') return await wechsleStufe(anfrage, db, umgebung, stufe, identitaet);
      return methodeNichtErlaubt('POST');
    }
    const angebot = ANGEBOT_PFAD.exec(pfad);
    if (angebot) {
      const [vorgangId, angebotId] = [angebot[1] ?? '', angebot[2] ?? ''];
      if (methode === 'PUT')
        return await legeAngebotAn(anfrage, db, umgebung, vorgangId, angebotId, identitaet);
      if (methode === 'GET') return await liefereAngebot(db, umgebung, vorgangId, angebotId);
      if (methode === 'DELETE')
        return await entferneAngebot(db, umgebung, vorgangId, angebotId, identitaet);
      return methodeNichtErlaubt('GET, PUT, DELETE');
    }
    const einreichen = EINREICHEN_PFAD.exec(pfad)?.[1];
    if (einreichen) {
      if (methode === 'POST')
        return await sendeMeldung(anfrage, db, umgebung, einreichen, identitaet);
      return methodeNichtErlaubt('POST');
    }
    const alleUnterschriften = UNTERSCHRIFTEN_PFAD.exec(pfad)?.[1];
    if (alleUnterschriften) {
      if (methode === 'DELETE')
        return await entferneAlleUnterschriften(db, alleUnterschriften, identitaet);
      return methodeNichtErlaubt('DELETE');
    }
    const einzeln = UNTERSCHRIFT_PFAD.exec(pfad);
    if (einzeln) {
      const slot = (einzeln[2] ?? '').toLowerCase();
      if (!istSlot(slot)) {
        return fehlerAntwort('VORGANG_PFAD_UNGUELTIG', 'Vorgänge-Endpunkt nicht gefunden.', 404);
      }
      const id = einzeln[1] ?? '';
      if (methode === 'PUT')
        return await setzeUnterschrift(anfrage, db, umgebung, id, slot, identitaet);
      if (methode === 'DELETE')
        return await entferneUnterschrift(db, umgebung, id, slot, identitaet);
      return methodeNichtErlaubt('PUT, DELETE');
    }

    return fehlerAntwort('VORGANG_PFAD_UNGUELTIG', 'Vorgänge-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('VORGAENGE_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'VORGANG_DB_FEHLER',
      'Die Vorgänge konnten nicht verarbeitet werden.',
      502,
    );
  }
}
