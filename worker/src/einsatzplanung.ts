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
import {
  aktualisiereAufbauVorlage,
  legeAufbauVorlageAn,
  leseAufbauVorlage,
  listeAufbauVorlagen,
  loescheAufbauVorlage,
} from './einsatzplanung-aufbau-vorlagen';
import { leseAufbau, loescheAufbau, schreibeAufbau } from './einsatzplanung-aufbauten';
import { type EinsatzplanungKonfiguration } from './einsatzplanung-gemeinsam';
import { aktualisiereKiste, legeKisteAn, listeKisten, loescheKiste } from './einsatzplanung-kisten';
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
import { UUID_MUSTER } from './json-lesen';

/**
 * Einsatzplanung: Einsätze, PEP, Aufbau und deren Vorlagen liegen in einer
 * eigenen D1-Datenbank (EINSATZPLANUNG_DB). Rechte vorerst alle, Rollen später.
 */
const EINSAETZE_LISTE_PFAD = '/api/einsatzplanung/einsaetze';
const EINSATZ_PFAD = new RegExp(`^/api/einsatzplanung/einsaetze/(${UUID_MUSTER})$`, 'i');
const PEP_PFAD = new RegExp(`^/api/einsatzplanung/einsaetze/(${UUID_MUSTER})/pep$`, 'i');
const AUFBAU_PFAD = new RegExp(`^/api/einsatzplanung/einsaetze/(${UUID_MUSTER})/aufbau$`, 'i');
const AUFBAU_VORLAGEN_LISTE_PFAD = '/api/einsatzplanung/aufbau-vorlagen';
const AUFBAU_VORLAGE_PFAD = new RegExp(
  `^/api/einsatzplanung/aufbau-vorlagen/(${UUID_MUSTER})$`,
  'i',
);
const PEP_VORLAGEN_LISTE_PFAD = '/api/einsatzplanung/pep-vorlagen';
const PEP_VORLAGE_PFAD = new RegExp(`^/api/einsatzplanung/pep-vorlagen/(${UUID_MUSTER})$`, 'i');
const LAGER_LISTE_PFAD = '/api/einsatzplanung/lager';
const LAGER_REIHENFOLGE_PFAD = '/api/einsatzplanung/lager/reihenfolge';
const LAGER_PFAD = new RegExp(`^/api/einsatzplanung/lager/(${UUID_MUSTER})$`, 'i');
const ARTIKEL_LISTE_PFAD = '/api/einsatzplanung/artikel';
const ARTIKEL_PFAD = new RegExp(`^/api/einsatzplanung/artikel/(${UUID_MUSTER})$`, 'i');
const KISTEN_LISTE_PFAD = '/api/einsatzplanung/kisten';
const KISTE_PFAD = new RegExp(`^/api/einsatzplanung/kisten/(${UUID_MUSTER})$`, 'i');

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

    const pepEinsatzId = PEP_PFAD.exec(url.pathname)?.[1];
    if (pepEinsatzId) {
      if (methode === 'GET') return await lesePep(db, pepEinsatzId);
      if (methode === 'PUT') return await schreibePep(anfrage, db, pepEinsatzId, identitaet);
      if (methode === 'DELETE') return await loeschePep(anfrage, db, pepEinsatzId);
      return nichtErlaubt('GET, PUT, DELETE');
    }

    const aufbauEinsatzId = AUFBAU_PFAD.exec(url.pathname)?.[1];
    if (aufbauEinsatzId) {
      if (methode === 'GET') return await leseAufbau(db, aufbauEinsatzId);
      if (methode === 'PUT') return await schreibeAufbau(anfrage, db, aufbauEinsatzId, identitaet);
      if (methode === 'DELETE') return await loescheAufbau(anfrage, db, aufbauEinsatzId);
      return nichtErlaubt('GET, PUT, DELETE');
    }

    if (url.pathname === AUFBAU_VORLAGEN_LISTE_PFAD) {
      if (methode === 'GET') return await listeAufbauVorlagen(db);
      if (methode === 'POST') return await legeAufbauVorlageAn(anfrage, db, identitaet);
      return nichtErlaubt('GET, POST');
    }

    const aufbauVorlageId = AUFBAU_VORLAGE_PFAD.exec(url.pathname)?.[1];
    if (aufbauVorlageId) {
      if (methode === 'GET') return await leseAufbauVorlage(db, aufbauVorlageId);
      if (methode === 'PUT') {
        return await aktualisiereAufbauVorlage(anfrage, db, aufbauVorlageId, identitaet);
      }
      if (methode === 'DELETE') return await loescheAufbauVorlage(anfrage, db, aufbauVorlageId);
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

    if (url.pathname === KISTEN_LISTE_PFAD) {
      if (methode === 'GET') return await listeKisten(db);
      if (methode === 'POST') return await legeKisteAn(anfrage, db, identitaet);
      return nichtErlaubt('GET, POST');
    }

    const kisteId = KISTE_PFAD.exec(url.pathname)?.[1]?.toLowerCase();
    if (kisteId) {
      if (methode === 'PUT') return await aktualisiereKiste(anfrage, db, kisteId, identitaet);
      if (methode === 'DELETE') return await loescheKiste(anfrage, db, kisteId);
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
