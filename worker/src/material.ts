import { type Benutzer } from './anmeldung';
import { fehlerAntwort } from './antwort';
import { UUID_MUSTER } from './json-lesen';
import {
  aktualisiereBehaelter,
  legeBehaelterAn,
  leseBehaelter,
  listeBehaelter,
  loescheBehaelter,
} from './material-behaelter';
import { liefereBericht, sendeMaterialBericht } from './material-berichtsversand';
import {
  legeCheckAn,
  leseCheck,
  lesePruefauftrag,
  listeChecks,
  loescheEntwurf,
  speichereEntwurf,
} from './material-checkablauf';
import { type MaterialKonfiguration } from './material-gemeinsam';
import { erneuerePruefcode, lesePruefcode, listePruefcodes } from './material-pruefcodes';
import {
  aktualisiereVorlage,
  legeVorlageAn,
  leseVorlage,
  listeVorlagen,
  loescheVorlage,
} from './material-vorlagen';

/**
 * Materialverwaltung, Punkt "Fahrzeugcheck" (AP-M1).
 *
 * Liegt in FAHRZEUGE_DB und nicht in einer eigenen Datenbank: ein Behälter ist
 * kein eigenständiges Fachobjekt, sondern hängt an genau einem Fahrzeug, und
 * die Freigabeberechtigung eines Checks entsteht ausschließlich aus
 * `fahrzeuge.gruppe`. Die ausführliche Begründung steht im Kopf von
 * `worker/migrations/fahrzeuge/0010_material.sql` und in `docs/konzept-material.md`.
 *
 * Rechte vorerst alle, Rollen später: Vorlagen und Behälter darf jede geprüfte
 * Identität anlegen, ändern und löschen. Tatsächlich durchgesetzt wird eine
 * Rolle nur dort, wo eine ungeprüfte Angabe zu einem geprüften Stand wird –
 * bei der Freigabe einer öffentlichen Einreichung (siehe `rollen.ts`).
 */
export const MATERIAL_PRAEFIX = '/api/material';
const VORLAGEN_LISTE_PFAD = '/api/material/vorlagen';
const VORLAGE_PFAD = new RegExp(`^/api/material/vorlagen/(${UUID_MUSTER})$`, 'i');
const BEHAELTER_LISTE_PFAD = '/api/material/behaelter';
const BEHAELTER_PFAD = new RegExp(`^/api/material/behaelter/(${UUID_MUSTER})$`, 'i');
const PRUEFAUFTRAG_PFAD = new RegExp(
  `^/api/material/behaelter/(${UUID_MUSTER})/pruefauftrag$`,
  'i',
);
const CHECKS_PFAD = new RegExp(`^/api/material/behaelter/(${UUID_MUSTER})/checks$`, 'i');
const ENTWURF_PFAD = new RegExp(`^/api/material/behaelter/(${UUID_MUSTER})/entwurf$`, 'i');
const CHECK_PFAD = new RegExp(`^/api/material/checks/(${UUID_MUSTER})$`, 'i');
// `art` steht im Pfad und nicht als Query-Parameter: der Verteiler weist jede
// Anfrage mit Query-String ab.
const BERICHT_PFAD = new RegExp(
  `^/api/material/checks/(${UUID_MUSTER})/bericht/([a-z-]{1,20})$`,
  'i',
);
const SENDEN_PFAD = new RegExp(
  `^/api/material/checks/(${UUID_MUSTER})/bericht/([a-z-]{1,20})/senden$`,
  'i',
);
const PRUEFCODES_PFAD = '/api/material/pruefcodes';
const PRUEFCODE_PFAD = new RegExp(`^/api/material/behaelter/(${UUID_MUSTER})/pruefcode$`, 'i');

/**
 * Feste Materialendpunkte hinter der bereits geprüften Anmeldung. Kein
 * generischer Abfrageendpunkt: keine Query-Parameter, keine frei wählbaren
 * Pfade. `identitaet` stammt ausschließlich aus dem verifizierten Access-JWT.
 */
export async function verarbeiteMaterial(
  anfrage: Request,
  umgebung: MaterialKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.FAHRZEUGE_DB;
  if (!db) {
    return fehlerAntwort(
      'MATERIAL_KONFIGURATION_FEHLT',
      'Die Materialverwaltung ist noch nicht eingerichtet.',
      503,
    );
  }

  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('MATERIAL_PFAD_UNGUELTIG', 'Material-Endpunkt nicht gefunden.', 404);
  }

  try {
    if (url.pathname === VORLAGEN_LISTE_PFAD) {
      if (anfrage.method === 'GET') return await listeVorlagen(db);
      if (anfrage.method === 'POST') return await legeVorlageAn(anfrage, db, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    const vorlageId = VORLAGE_PFAD.exec(url.pathname)?.[1];
    if (vorlageId) {
      if (anfrage.method === 'GET') return await leseVorlage(db, vorlageId);
      if (anfrage.method === 'PUT')
        return await aktualisiereVorlage(anfrage, db, vorlageId, identitaet);
      if (anfrage.method === 'DELETE') return await loescheVorlage(db, vorlageId);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, PUT, DELETE',
      });
    }

    if (url.pathname === BEHAELTER_LISTE_PFAD) {
      if (anfrage.method === 'GET') return await listeBehaelter(db);
      if (anfrage.method === 'POST') return await legeBehaelterAn(anfrage, db, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    if (url.pathname === PRUEFCODES_PFAD) {
      if (anfrage.method === 'GET') return await listePruefcodes(db, umgebung, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    const pruefcodeId = PRUEFCODE_PFAD.exec(url.pathname)?.[1];
    if (pruefcodeId) {
      if (anfrage.method === 'GET')
        return await lesePruefcode(db, umgebung, pruefcodeId, identitaet);
      if (anfrage.method === 'POST')
        return await erneuerePruefcode(db, umgebung, pruefcodeId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    // Die festen Unterpfade stehen vor dem UUID-Pfad des Behälters, sonst
    // liefe `/behaelter/<UUID>/checks` in dessen Nichttreffer.
    const auftragId = PRUEFAUFTRAG_PFAD.exec(url.pathname)?.[1];
    if (auftragId) {
      if (anfrage.method === 'GET') return await lesePruefauftrag(db, auftragId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    const entwurfBehaelterId = ENTWURF_PFAD.exec(url.pathname)?.[1];
    if (entwurfBehaelterId) {
      if (anfrage.method === 'PUT')
        return await speichereEntwurf(anfrage, db, entwurfBehaelterId, identitaet);
      if (anfrage.method === 'DELETE')
        return await loescheEntwurf(db, entwurfBehaelterId, identitaet);
      // Bewusst kein GET: der Zwischenstand reist im Prüfauftrag mit, ein
      // eigener Abruf wäre eine zweite Worker-Anfrage für Daten, die immer
      // zusammen gebraucht werden.
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'PUT, DELETE',
      });
    }

    const checksBehaelterId = CHECKS_PFAD.exec(url.pathname)?.[1];
    if (checksBehaelterId) {
      if (anfrage.method === 'GET') return await listeChecks(db, checksBehaelterId);
      if (anfrage.method === 'POST')
        return await legeCheckAn(anfrage, db, checksBehaelterId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, POST',
      });
    }

    // Die längeren Berichtspfade stehen vor dem einfachen Check-Pfad; `senden`
    // wiederum vor der reinen Vorschau, weil es deren Präfix teilt.
    const senden = SENDEN_PFAD.exec(url.pathname);
    if (senden) {
      if (anfrage.method === 'POST')
        return await sendeMaterialBericht(
          anfrage,
          umgebung,
          db,
          senden[1] as string,
          senden[2] as string,
          identitaet,
        );
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'POST',
      });
    }

    const bericht = BERICHT_PFAD.exec(url.pathname);
    if (bericht) {
      if (anfrage.method === 'GET')
        return await liefereBericht(db, bericht[1] as string, bericht[2] as string);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    const checkId = CHECK_PFAD.exec(url.pathname)?.[1];
    if (checkId) {
      if (anfrage.method === 'GET') return await leseCheck(db, checkId);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    const behaelterId = BEHAELTER_PFAD.exec(url.pathname)?.[1];
    if (behaelterId) {
      if (anfrage.method === 'GET') return await leseBehaelter(db, behaelterId);
      if (anfrage.method === 'PUT')
        return await aktualisiereBehaelter(anfrage, db, behaelterId, identitaet);
      if (anfrage.method === 'DELETE') return await loescheBehaelter(db, behaelterId);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, PUT, DELETE',
      });
    }

    return fehlerAntwort('MATERIAL_PFAD_UNGUELTIG', 'Material-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('MATERIAL_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'MATERIAL_DB_FEHLER',
      'Die Materialdaten konnten nicht verarbeitet werden.',
      502,
    );
  }
}
