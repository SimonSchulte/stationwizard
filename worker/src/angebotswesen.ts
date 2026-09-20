import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag, versionAusEtag } from './etag';
import { istNichtleererText, istObjekt, istText, leseJsonBegrenzt } from './json-lesen';

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
export interface AngebotswesenKonfiguration {
  ANGEBOTSWESEN_DB?: D1Database;
}

const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_REGEX = new RegExp(`^${UUID_MUSTER}$`, 'i');

const PREISKATALOG_LISTE_PFAD = '/api/angebotswesen/preiskatalog';
const PREISKATALOG_PFAD = new RegExp(`^/api/angebotswesen/preiskatalog/(${UUID_MUSTER})$`, 'i');
const ANGEBOTE_LISTE_PFAD = '/api/angebotswesen/angebote';
const ANGEBOT_PFAD = new RegExp(`^/api/angebotswesen/angebote/(${UUID_MUSTER})$`, 'i');

const PREISKATALOG_ARTEN = new Set(['einsatzkraft', 'fahrzeug']);
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_MUSTER = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Preiskatalog-Einträge sind klein; Angebote können mehrere Schichten mit
// mehreren Positionen enthalten, bleiben aber weit unter Excel-Größenordnung.
const PREISKATALOG_KOERPER_GRENZE = 4 * 1024;
const ANGEBOT_KOERPER_GRENZE = 128 * 1024;

function zeitAlsMinuten(zeit: string): number | null {
  const treffer = HHMM_MUSTER.exec(zeit);
  if (!treffer) return null;
  return Number(treffer[1]) * 60 + Number(treffer[2]);
}

/* -------------------------------------------------------------------- */
/* Preiskatalog                                                         */
/* -------------------------------------------------------------------- */

interface PreiskatalogEingabe {
  id: string;
  bezeichnung: string;
  art: string;
  einzelpreisCent: number;
}

function pruefePreiskatalogEingabe(wert: unknown): PreiskatalogEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istText(wert['art']) ||
    !PREISKATALOG_ARTEN.has(wert['art']) ||
    typeof wert['einzelpreisCent'] !== 'number' ||
    !Number.isInteger(wert['einzelpreisCent']) ||
    wert['einzelpreisCent'] < 0
  ) {
    return null;
  }
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    art: wert['art'],
    einzelpreisCent: wert['einzelpreisCent'],
  };
}

interface PreiskatalogZeile {
  id: string;
  bezeichnung: string;
  art: string;
  einzelpreis_cent: number;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuPreiskatalogJson(zeile: PreiskatalogZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    art: zeile.art,
    einzelpreisCent: zeile.einzelpreis_cent,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
    // Bewusste Abweichung vom Fahrzeuge-Einzel-ETag-Muster: bei vielen
    // kleinen, inline editierbaren Zeilen wäre ein `ladeEintrag(id)`-
    // Roundtrip vor jeder Änderung ein Verstoß gegen die Sparsamkeitsregel.
    version: zeile.version,
  };
}

async function listePreiskatalog(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM preiskatalog_eintraege ORDER BY bezeichnung')
    .all<PreiskatalogZeile>();
  return jsonAntwort({ eintraege: ergebnis.results.map(zuPreiskatalogJson) });
}

async function legePreiskatalogEintragAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, PREISKATALOG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefePreiskatalogEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiger Preiskatalog-Eintrag.', 400);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO preiskatalog_eintraege
           (id, bezeichnung, art, einzelpreis_cent, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.art,
        eingabe.einzelpreisCent,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return fehlerAntwort(
      'PREISKATALOG_KONFLIKT',
      'Ein Eintrag mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      art: eingabe.art,
      einzelpreisCent: eingabe.einzelpreisCent,
      geaendertAm: jetzt,
      geaendertVon: identitaet.email,
      version: 1,
    },
    201,
  );
}

async function aktualisierePreiskatalogEintrag(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const erwarteteVersion = versionAusEtag(ifMatch);
  if (erwarteteVersion === null) {
    return fehlerAntwort('ANGEBOTSWESEN_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  const koerper = await lesePruefeKoerper(anfrage, PREISKATALOG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefePreiskatalogEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiger Preiskatalog-Eintrag.', 400);
  }
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE preiskatalog_eintraege
       SET bezeichnung = ?, art = ?, einzelpreis_cent = ?, geaendert_am = ?, geaendert_von = ?,
           version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.bezeichnung,
      eingabe.art,
      eingabe.einzelpreisCent,
      jetzt,
      identitaet.email,
      id,
      erwarteteVersion,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'PREISKATALOG_KONFLIKT',
      'Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return jsonAntwort({
    id: eingabe.id,
    bezeichnung: eingabe.bezeichnung,
    art: eingabe.art,
    einzelpreisCent: eingabe.einzelpreisCent,
    geaendertAm: jetzt,
    geaendertVon: identitaet.email,
    version: erwarteteVersion + 1,
  });
}

async function loeschePreiskatalogEintrag(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db
    .prepare('DELETE FROM preiskatalog_eintraege WHERE id = ?')
    .bind(id)
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('PREISKATALOG_NICHT_GEFUNDEN', 'Eintrag nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}

/* -------------------------------------------------------------------- */
/* Angebote                                                              */
/* -------------------------------------------------------------------- */

interface PositionEingabe {
  id: string;
  herkunftEintragId: string | null;
  art: string;
  bezeichnung: string;
  einzelpreisCent: number;
  anzahl: number;
  stunden: number | null;
}

function pruefePosition(wert: unknown): PositionEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !(wert['herkunftEintragId'] === null || istNichtleererText(wert['herkunftEintragId'])) ||
    !istText(wert['art']) ||
    !PREISKATALOG_ARTEN.has(wert['art']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    typeof wert['einzelpreisCent'] !== 'number' ||
    !Number.isInteger(wert['einzelpreisCent']) ||
    wert['einzelpreisCent'] < 0 ||
    typeof wert['anzahl'] !== 'number' ||
    !Number.isInteger(wert['anzahl']) ||
    wert['anzahl'] < 1
  ) {
    return null;
  }
  const art = wert['art'];
  const stunden = wert['stunden'];
  if (art === 'fahrzeug') {
    if (stunden !== null) return null;
  } else {
    if (typeof stunden !== 'number' || !Number.isFinite(stunden) || stunden <= 0) return null;
  }
  return {
    id: wert['id'],
    herkunftEintragId: istText(wert['herkunftEintragId']) ? wert['herkunftEintragId'] : null,
    art,
    bezeichnung: wert['bezeichnung'],
    einzelpreisCent: wert['einzelpreisCent'],
    anzahl: wert['anzahl'],
    stunden: art === 'fahrzeug' ? null : (stunden as number),
  };
}

interface SchichtEingabe {
  id: string;
  datum: string;
  von: string;
  bis: string;
  positionen: PositionEingabe[];
}

function pruefeSchicht(wert: unknown): SchichtEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !istText(wert['datum']) ||
    !ISO_DATUM.test(wert['datum']) ||
    !istText(wert['von']) ||
    !istText(wert['bis']) ||
    !Array.isArray(wert['positionen'])
  ) {
    return null;
  }
  const vonMin = zeitAlsMinuten(wert['von']);
  const bisMin = zeitAlsMinuten(wert['bis']);
  if (vonMin === null || bisMin === null || bisMin <= vonMin) return null;
  const positionen = wert['positionen'].map(pruefePosition);
  if (positionen.some((p) => p === null)) return null;
  return {
    id: wert['id'],
    datum: wert['datum'],
    von: wert['von'],
    bis: wert['bis'],
    positionen: positionen as PositionEingabe[],
  };
}

interface AngebotEingabe {
  id: string;
  bezeichnung: string;
  auftraggeber: string;
  bemerkung: string;
  schichten: SchichtEingabe[];
  materialpauschaleAktiv: boolean;
  materialpauschaleCent: number | null;
  pauschalpreisAktiv: boolean;
  pauschalpreisCent: number | null;
}

/**
 * Prüft ein `<x>Aktiv`/`<x>Cent`-Wertepaar: bei aktivem Flag ist der Cent-Wert
 * Pflicht (Ganzzahl >= 0), sonst optional (fehlend/`null` oder Ganzzahl >= 0).
 * Gemeinsam für Materialpauschale und Pauschalpreis, die derselben Regel folgen.
 */
function pruefePauschale(aktiv: unknown, centRoh: unknown): { cent: number | null } | null {
  if (typeof aktiv !== 'boolean') return null;
  if (aktiv) {
    if (typeof centRoh !== 'number' || !Number.isInteger(centRoh) || centRoh < 0) return null;
    return { cent: centRoh };
  }
  if (
    centRoh !== null &&
    !(typeof centRoh === 'number' && Number.isInteger(centRoh) && centRoh >= 0)
  ) {
    return null;
  }
  return { cent: centRoh === undefined ? null : (centRoh as number) };
}

function pruefeAngebotEingabe(wert: unknown): AngebotEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istText(wert['auftraggeber']) ||
    !istText(wert['bemerkung']) ||
    !Array.isArray(wert['schichten'])
  ) {
    return null;
  }
  const schichten = wert['schichten'].map(pruefeSchicht);
  if (schichten.some((s) => s === null)) return null;
  const materialpauschale = pruefePauschale(
    wert['materialpauschaleAktiv'],
    wert['materialpauschaleCent'],
  );
  const pauschalpreis = pruefePauschale(wert['pauschalpreisAktiv'], wert['pauschalpreisCent']);
  if (!materialpauschale || !pauschalpreis) return null;
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    auftraggeber: wert['auftraggeber'],
    bemerkung: wert['bemerkung'],
    schichten: schichten as SchichtEingabe[],
    materialpauschaleAktiv: wert['materialpauschaleAktiv'] as boolean,
    materialpauschaleCent: materialpauschale.cent,
    pauschalpreisAktiv: wert['pauschalpreisAktiv'] as boolean,
    pauschalpreisCent: pauschalpreis.cent,
  };
}

interface AngebotZeile {
  id: string;
  bezeichnung: string;
  auftraggeber: string;
  bemerkung: string;
  schichten: string;
  materialpauschale_aktiv: number;
  materialpauschale_cent: number | null;
  pauschalpreis_aktiv: number;
  pauschalpreis_cent: number | null;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuAngebotJson(zeile: AngebotZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    auftraggeber: zeile.auftraggeber,
    bemerkung: zeile.bemerkung,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    schichten: JSON.parse(zeile.schichten),
    materialpauschaleAktiv: zeile.materialpauschale_aktiv === 1,
    materialpauschaleCent: zeile.materialpauschale_cent,
    pauschalpreisAktiv: zeile.pauschalpreis_aktiv === 1,
    pauschalpreisCent: zeile.pauschalpreis_cent,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

async function listeAngebote(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM angebote ORDER BY bezeichnung')
    .all<AngebotZeile>();
  return jsonAntwort({ angebote: ergebnis.results.map(zuAngebotJson) });
}

async function leseAngebot(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM angebote WHERE id = ?')
    .bind(id)
    .first<AngebotZeile>();
  if (!zeile) {
    return fehlerAntwort('ANGEBOT_NICHT_GEFUNDEN', 'Angebot nicht gefunden.', 404);
  }
  return jsonAntwort(zuAngebotJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

async function legeAngebotAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, ANGEBOT_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAngebotEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiges Angebot.', 400);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO angebote
           (id, bezeichnung, auftraggeber, bemerkung, schichten, materialpauschale_aktiv,
            materialpauschale_cent, pauschalpreis_aktiv, pauschalpreis_cent, geaendert_am,
            geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.auftraggeber,
        eingabe.bemerkung,
        JSON.stringify(eingabe.schichten),
        eingabe.materialpauschaleAktiv ? 1 : 0,
        eingabe.materialpauschaleCent,
        eingabe.pauschalpreisAktiv ? 1 : 0,
        eingabe.pauschalpreisCent,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return fehlerAntwort(
      'ANGEBOT_KONFLIKT',
      'Ein Angebot mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      auftraggeber: eingabe.auftraggeber,
      bemerkung: eingabe.bemerkung,
      schichten: eingabe.schichten,
      materialpauschaleAktiv: eingabe.materialpauschaleAktiv,
      materialpauschaleCent: eingabe.materialpauschaleCent,
      pauschalpreisAktiv: eingabe.pauschalpreisAktiv,
      pauschalpreisCent: eingabe.pauschalpreisCent,
      geaendertAm: jetzt,
      geaendertVon: identitaet.email,
    },
    201,
    { ETag: starkesEtag(1) },
  );
}

async function aktualisiereAngebot(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const erwarteteVersion = versionAusEtag(ifMatch);
  if (erwarteteVersion === null) {
    return fehlerAntwort('ANGEBOTSWESEN_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  const koerper = await lesePruefeKoerper(anfrage, ANGEBOT_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAngebotEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiges Angebot.', 400);
  }
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE angebote
       SET bezeichnung = ?, auftraggeber = ?, bemerkung = ?, schichten = ?,
           materialpauschale_aktiv = ?, materialpauschale_cent = ?, pauschalpreis_aktiv = ?,
           pauschalpreis_cent = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.bezeichnung,
      eingabe.auftraggeber,
      eingabe.bemerkung,
      JSON.stringify(eingabe.schichten),
      eingabe.materialpauschaleAktiv ? 1 : 0,
      eingabe.materialpauschaleCent,
      eingabe.pauschalpreisAktiv ? 1 : 0,
      eingabe.pauschalpreisCent,
      jetzt,
      identitaet.email,
      id,
      erwarteteVersion,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'ANGEBOT_KONFLIKT',
      'Das Angebot wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      auftraggeber: eingabe.auftraggeber,
      bemerkung: eingabe.bemerkung,
      schichten: eingabe.schichten,
      materialpauschaleAktiv: eingabe.materialpauschaleAktiv,
      materialpauschaleCent: eingabe.materialpauschaleCent,
      pauschalpreisAktiv: eingabe.pauschalpreisAktiv,
      pauschalpreisCent: eingabe.pauschalpreisCent,
      geaendertAm: jetzt,
      geaendertVon: identitaet.email,
    },
    200,
    { ETag: starkesEtag(erwarteteVersion + 1) },
  );
}

async function loescheAngebot(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db.prepare('DELETE FROM angebote WHERE id = ?').bind(id).run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('ANGEBOT_NICHT_GEFUNDEN', 'Angebot nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}

/* -------------------------------------------------------------------- */
/* Gemeinsames                                                           */
/* -------------------------------------------------------------------- */

async function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort('ANGEBOTSWESEN_INHALTSTYP_UNGUELTIG', 'Unzulässiger Inhaltstyp.', 415);
  }
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 10_000);
  try {
    const ergebnis = await leseJsonBegrenzt(anfrage, grenze, abbruch.signal);
    if (!ergebnis.erfolg) {
      return ergebnis.ursache === 'zu-gross'
        ? fehlerAntwort('ANGEBOTSWESEN_DATEI_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
        : fehlerAntwort('ANGEBOTSWESEN_DATEI_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
    }
    return { inhalt: ergebnis.inhalt };
  } finally {
    clearTimeout(zeitlimit);
  }
}

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
