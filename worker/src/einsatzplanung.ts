import { type Benutzer } from './anmeldung';
import { fehlerAntwort } from './antwort';
import {
  aktualisiereEinsatz,
  legeEinsatzAn,
  leseEinsatz,
  listeEinsaetze,
} from './einsatzplanung-einsaetze';
import {
  aktualisiereArtikel,
  legeArtikelAn,
  listeArtikel,
  loescheArtikel,
} from './einsatzplanung-artikel';
import { type EinsatzplanungKonfiguration } from './einsatzplanung-gemeinsam';
import {
  aktualisiereLager,
  legeLagerAn,
  listeLager,
  loescheLager,
  setzeLagerReihenfolge,
} from './einsatzplanung-lager';
import {
  aktualisierePepVorlage,
  legePepVorlageAn,
  lesePepVorlage,
  listePepVorlagen,
  loeschePepVorlage,
} from './einsatzplanung-pep-vorlagen';
import { lesePep, loeschePep, schreibePep } from './einsatzplanung-peps';
import {
  leseVorbereitung,
  loescheVorbereitung,
  schreibeVorbereitung,
} from './einsatzplanung-vorbereitungen';
import {
  aktualisiereVorlage,
  legeVorlageAn,
  leseVorlage,
  listeVorlagen,
  loescheVorlage,
} from './einsatzplanung-vorlagen';
import { UUID_MUSTER } from './json-lesen';

/**
 * Einsatzplanung: Einsätze, Vorbereitungen (VB), PEP und beide Vorlagenarten liegen in einer
 * eigenen D1-Datenbank (EINSATZPLANUNG_DB). Rechte vorerst alle, Rollen später.
 */
const EINSAETZE_LISTE_PFAD = '/api/einsatzplanung/einsaetze';
const EINSATZ_PFAD = new RegExp(`^/api/einsatzplanung/einsaetze/(${UUID_MUSTER})$`, 'i');
const VB_PFAD = new RegExp(`^/api/einsatzplanung/einsaetze/(${UUID_MUSTER})/vb$`, 'i');
const PEP_PFAD = new RegExp(`^/api/einsatzplanung/einsaetze/(${UUID_MUSTER})/pep$`, 'i');
const PEP_VORLAGEN_LISTE_PFAD = '/api/einsatzplanung/pep-vorlagen';
const PEP_VORLAGE_PFAD = new RegExp(`^/api/einsatzplanung/pep-vorlagen/(${UUID_MUSTER})$`, 'i');
const VORLAGEN_LISTE_PFAD = '/api/einsatzplanung/vb-vorlagen';
const VORLAGE_PFAD = new RegExp(`^/api/einsatzplanung/vb-vorlagen/(${UUID_MUSTER})$`, 'i');
const LAGER_LISTE_PFAD = '/api/einsatzplanung/lager';
const LAGER_REIHENFOLGE_PFAD = '/api/einsatzplanung/lager/reihenfolge';
const LAGER_PFAD = new RegExp(`^/api/einsatzplanung/lager/(${UUID_MUSTER})$`, 'i');
const ARTIKEL_LISTE_PFAD = '/api/einsatzplanung/artikel';
const ARTIKEL_PFAD = new RegExp(`^/api/einsatzplanung/artikel/(${UUID_MUSTER})$`, 'i');

function nichtErlaubt(erlaubt: string): Response {
  return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, { Allow: erlaubt });
}

/**
 * Feste Einsatzplanung-Endpunkte hinter der bereits geprüften Anmeldung. Keine
 * Query-Parameter, keine frei wählbaren Pfade. `identitaet` stammt ausschließlich
 * aus dem verifizierten Access-JWT.
 */
export async function verarbeiteEinsatzplanung(
  anfrage: Request,
  umgebung: EinsatzplanungKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.EINSATZPLANUNG_DB;
  if (!db) {
    return fehlerAntwort(
      'EINSATZPLANUNG_KONFIGURATION_FEHLT',
      'Die Einsatzplanung ist noch nicht eingerichtet.',
      503,
    );
  }

  const url = new URL(anfrage.url);
  const pfadUngueltig = () =>
    fehlerAntwort('EINSATZPLANUNG_PFAD_UNGUELTIG', 'Einsatzplanung-Endpunkt nicht gefunden.', 404);
  if (url.search || url.hash) return pfadUngueltig();

  const methode = anfrage.method;
  try {
    if (url.pathname === EINSAETZE_LISTE_PFAD) {
      if (methode === 'GET') return await listeEinsaetze(db);
      if (methode === 'POST') return await legeEinsatzAn(anfrage, db, identitaet);
      return nichtErlaubt('GET, POST');
    }

    const einsatzId = EINSATZ_PFAD.exec(url.pathname)?.[1];
    if (einsatzId) {
      if (methode === 'GET') return await leseEinsatz(db, einsatzId);
      if (methode === 'PUT') return await aktualisiereEinsatz(anfrage, db, einsatzId, identitaet);
      return nichtErlaubt('GET, PUT');
    }

    const vbEinsatzId = VB_PFAD.exec(url.pathname)?.[1];
    if (vbEinsatzId) {
      if (methode === 'GET') return await leseVorbereitung(db, vbEinsatzId);
      if (methode === 'PUT') {
        return await schreibeVorbereitung(anfrage, db, vbEinsatzId, identitaet);
      }
      if (methode === 'DELETE') return await loescheVorbereitung(anfrage, db, vbEinsatzId);
      return nichtErlaubt('GET, PUT, DELETE');
    }

    const pepEinsatzId = PEP_PFAD.exec(url.pathname)?.[1];
    if (pepEinsatzId) {
      if (methode === 'GET') return await lesePep(db, pepEinsatzId);
      if (methode === 'PUT') return await schreibePep(anfrage, db, pepEinsatzId, identitaet);
      if (methode === 'DELETE') return await loeschePep(anfrage, db, pepEinsatzId);
      return nichtErlaubt('GET, PUT, DELETE');
    }

    if (url.pathname === PEP_VORLAGEN_LISTE_PFAD) {
      if (methode === 'GET') return await listePepVorlagen(db);
      if (methode === 'POST') return await legePepVorlageAn(anfrage, db, identitaet);
      return nichtErlaubt('GET, POST');
    }

    const pepVorlageId = PEP_VORLAGE_PFAD.exec(url.pathname)?.[1];
    if (pepVorlageId) {
      if (methode === 'GET') return await lesePepVorlage(db, pepVorlageId);
      if (methode === 'PUT') {
        return await aktualisierePepVorlage(anfrage, db, pepVorlageId, identitaet);
      }
      if (methode === 'DELETE') return await loeschePepVorlage(anfrage, db, pepVorlageId);
      return nichtErlaubt('GET, PUT, DELETE');
    }

    if (url.pathname === VORLAGEN_LISTE_PFAD) {
      if (methode === 'GET') return await listeVorlagen(db);
      if (methode === 'POST') return await legeVorlageAn(anfrage, db, identitaet);
      return nichtErlaubt('GET, POST');
    }

    const vorlageId = VORLAGE_PFAD.exec(url.pathname)?.[1];
    if (vorlageId) {
      if (methode === 'GET') return await leseVorlage(db, vorlageId);
      if (methode === 'PUT') return await aktualisiereVorlage(anfrage, db, vorlageId, identitaet);
      if (methode === 'DELETE') return await loescheVorlage(anfrage, db, vorlageId);
      return nichtErlaubt('GET, PUT, DELETE');
    }

    if (url.pathname === LAGER_LISTE_PFAD) {
      if (methode === 'GET') return await listeLager(db);
      if (methode === 'POST') return await legeLagerAn(anfrage, db, identitaet);
      return nichtErlaubt('GET, POST');
    }

    if (url.pathname === LAGER_REIHENFOLGE_PFAD) {
      if (methode === 'PUT') return await setzeLagerReihenfolge(anfrage, db, identitaet);
      return nichtErlaubt('PUT');
    }

    const lagerId = LAGER_PFAD.exec(url.pathname)?.[1]?.toLowerCase();
    if (lagerId) {
      if (methode === 'PUT') return await aktualisiereLager(anfrage, db, lagerId, identitaet);
      if (methode === 'DELETE') return await loescheLager(anfrage, db, lagerId);
      return nichtErlaubt('PUT, DELETE');
    }

    if (url.pathname === ARTIKEL_LISTE_PFAD) {
      if (methode === 'GET') return await listeArtikel(db);
      if (methode === 'POST') return await legeArtikelAn(anfrage, db, identitaet);
      return nichtErlaubt('GET, POST');
    }

    const artikelId = ARTIKEL_PFAD.exec(url.pathname)?.[1]?.toLowerCase();
    if (artikelId) {
      if (methode === 'PUT') return await aktualisiereArtikel(anfrage, db, artikelId, identitaet);
      if (methode === 'DELETE') return await loescheArtikel(anfrage, db, artikelId);
      return nichtErlaubt('PUT, DELETE');
    }

    return pfadUngueltig();
  } catch (ursache) {
    console.error('EINSATZPLANUNG_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'EINSATZPLANUNG_DB_FEHLER',
      'Die Einsatzplanung-Daten konnten nicht verarbeitet werden.',
      502,
    );
  }
}
