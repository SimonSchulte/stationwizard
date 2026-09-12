import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, leseJsonBegrenzt } from './json-lesen';

export interface FahrzeugeKonfiguration {
  FAHRZEUGE_DB?: D1Database;
}

/** Ausschließlich die vom Worker geprüfte Access-Identität, nie ein Client-Feld. */
export interface GeprueftesBenutzerkonto {
  email: string;
}

const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FAHRZEUG_LISTE_PFAD = '/api/fahrzeuge';
const FAHRZEUG_PFAD = new RegExp(`^/api/fahrzeuge/(${UUID_MUSTER})$`, 'i');
const ABLESUNGEN_PFAD = new RegExp(`^/api/fahrzeuge/(${UUID_MUSTER})/ablesungen$`, 'i');

const EIGENTUEMER = new Set(['land-nrw', 'bund', 'organisation']);
const WARTUNGS_ARTEN = new Set(['hu', 'frei']);
const KILOMETER_QUELLEN = new Set(['qr', 'formular', 'korrektur']);
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const FIN_MUSTER = /^[A-HJ-NPR-Z0-9]{17}$/i;

// Stammdaten mit Wartungsterminen bleiben klein; großzügige, aber feste Grenze
// gegen Missbrauch. Ablesungen sind noch kleiner.
const FAHRZEUG_KOERPER_GRENZE = 64 * 1024;
const ABLESUNG_KOERPER_GRENZE = 4 * 1024;

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istNichtleererText(wert: unknown): wert is string {
  return istText(wert) && wert.trim().length > 0;
}

function istWartungstermin(wert: unknown): boolean {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istText(wert['art']) &&
    WARTUNGS_ARTEN.has(wert['art']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istText(wert['faelligAm']) &&
    ISO_DATUM.test(wert['faelligAm']) &&
    typeof wert['erinnerungTage'] === 'number' &&
    Number.isFinite(wert['erinnerungTage']) &&
    wert['erinnerungTage'] >= 0 &&
    (wert['erledigtAm'] === null ||
      (istText(wert['erledigtAm']) && ISO_DATUM.test(wert['erledigtAm'])))
  );
}

interface FahrzeugEingabe {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  fahrgestellnummer: string | null;
  eigentuemer: string;
  bemerkung: string;
  wartungstermine: unknown[];
}

function pruefeFahrzeugEingabe(wert: unknown): FahrzeugEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !new RegExp(`^${UUID_MUSTER}$`, 'i').test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istText(wert['funkrufname']) ||
    !istText(wert['kennzeichen']) ||
    !(wert['fahrgestellnummer'] === null || istText(wert['fahrgestellnummer'])) ||
    (istText(wert['fahrgestellnummer']) &&
      wert['fahrgestellnummer'].length > 0 &&
      !FIN_MUSTER.test(wert['fahrgestellnummer'])) ||
    !istText(wert['eigentuemer']) ||
    !EIGENTUEMER.has(wert['eigentuemer']) ||
    !istText(wert['bemerkung']) ||
    !Array.isArray(wert['wartungstermine']) ||
    !wert['wartungstermine'].every(istWartungstermin)
  ) {
    return null;
  }
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    funkrufname: wert['funkrufname'],
    kennzeichen: wert['kennzeichen'],
    fahrgestellnummer:
      istText(wert['fahrgestellnummer']) && wert['fahrgestellnummer'].length > 0
        ? wert['fahrgestellnummer']
        : null,
    eigentuemer: wert['eigentuemer'],
    bemerkung: wert['bemerkung'],
    wartungstermine: wert['wartungstermine'],
  };
}

interface AblesungEingabe {
  abgelesenAm: string;
  stand: number;
  quelle: string;
  korrigiert: string | null;
  bemerkung: string;
}

function pruefeAblesungEingabe(wert: unknown): AblesungEingabe | null {
  if (
    !istObjekt(wert) ||
    !istText(wert['abgelesenAm']) ||
    !ISO_DATUM.test(wert['abgelesenAm']) ||
    typeof wert['stand'] !== 'number' ||
    !Number.isFinite(wert['stand']) ||
    wert['stand'] < 0 ||
    !istText(wert['quelle']) ||
    !KILOMETER_QUELLEN.has(wert['quelle']) ||
    !(wert['korrigiert'] === null || istNichtleererText(wert['korrigiert'])) ||
    !istText(wert['bemerkung'])
  ) {
    return null;
  }
  return {
    abgelesenAm: wert['abgelesenAm'],
    stand: wert['stand'],
    quelle: wert['quelle'],
    korrigiert: istText(wert['korrigiert']) ? wert['korrigiert'] : null,
    bemerkung: wert['bemerkung'],
  };
}

interface FahrzeugZeile {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  fahrgestellnummer: string | null;
  eigentuemer: string;
  bemerkung: string;
  wartungstermine: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuFahrzeugJson(zeile: FahrzeugZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    funkrufname: zeile.funkrufname,
    kennzeichen: zeile.kennzeichen,
    fahrgestellnummer: zeile.fahrgestellnummer,
    eigentuemer: zeile.eigentuemer,
    bemerkung: zeile.bemerkung,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    wartungstermine: JSON.parse(zeile.wartungstermine),
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

interface AblesungZeile {
  id: string;
  fahrzeug_id: string;
  abgelesen_am: string;
  stand: number;
  erfasst_am: string;
  erfasst_von: string;
  quelle: string;
  korrigiert: string | null;
  bemerkung: string;
}

function zuAblesungJson(zeile: AblesungZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    fahrzeugId: zeile.fahrzeug_id,
    abgelesenAm: zeile.abgelesen_am,
    stand: zeile.stand,
    erfasstAm: zeile.erfasst_am,
    erfasstVon: zeile.erfasst_von,
    quelle: zeile.quelle,
    korrigiert: zeile.korrigiert,
    bemerkung: zeile.bemerkung,
  };
}

function starkesEtag(version: number): string {
  return `"${version}"`;
}

function istStarkerEtag(wert: string): boolean {
  return /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(wert);
}

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

    const fahrzeugId = FAHRZEUG_PFAD.exec(url.pathname)?.[1];
    if (fahrzeugId) {
      if (anfrage.method === 'GET') return await leseFahrzeug(db, fahrzeugId);
      if (anfrage.method === 'PUT')
        return await aktualisiereFahrzeug(anfrage, db, fahrzeugId, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET, PUT',
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

async function listeFahrzeuge(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM fahrzeuge ORDER BY bezeichnung')
    .all<FahrzeugZeile>();
  return jsonAntwort({ fahrzeuge: ergebnis.results.map(zuFahrzeugJson) });
}

async function leseFahrzeug(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM fahrzeuge WHERE id = ?')
    .bind(id)
    .first<FahrzeugZeile>();
  if (!zeile) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  return jsonAntwort(zuFahrzeugJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

async function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort('FAHRZEUGE_INHALTSTYP_UNGUELTIG', 'Unzulässiger Inhaltstyp.', 415);
  }
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 10_000);
  try {
    const ergebnis = await leseJsonBegrenzt(anfrage, grenze, abbruch.signal);
    if (!ergebnis.erfolg) {
      return ergebnis.ursache === 'zu-gross'
        ? fehlerAntwort('FAHRZEUGE_DATEI_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
        : fehlerAntwort('FAHRZEUGE_DATEI_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
    }
    return { inhalt: ergebnis.inhalt };
  } finally {
    clearTimeout(zeitlimit);
  }
}

async function legeFahrzeugAn(
  anfrage: Request,
  db: D1Database,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'FAHRZEUGE_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, FAHRZEUG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeFahrzeugEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('FAHRZEUGE_DATEI_UNGUELTIG', 'Ungültige Fahrzeugdaten.', 400);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO fahrzeuge
           (id, bezeichnung, funkrufname, kennzeichen, fahrgestellnummer, eigentuemer,
            bemerkung, wartungstermine, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.funkrufname,
        eingabe.kennzeichen,
        eingabe.fahrgestellnummer,
        eingabe.eigentuemer,
        eingabe.bemerkung,
        JSON.stringify(eingabe.wartungstermine),
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    // Primärschlüsselkonflikt: dieselbe id existiert bereits.
    return fehlerAntwort(
      'FAHRZEUGE_KONFLIKT',
      'Ein Fahrzeug mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return jsonAntwort({ ...eingabe, geaendertAm: jetzt, geaendertVon: identitaet.email }, 201, {
    ETag: starkesEtag(1),
  });
}

async function aktualisiereFahrzeug(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch || !istStarkerEtag(ifMatch)) {
    return fehlerAntwort(
      'FAHRZEUGE_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const erwarteteVersion = Number(ifMatch.slice(1, -1));
  if (!Number.isInteger(erwarteteVersion) || erwarteteVersion < 1) {
    return fehlerAntwort('FAHRZEUGE_VORBEDINGUNG_UNGUELTIG', 'Ungültige Dateiversion.', 400);
  }
  const koerper = await lesePruefeKoerper(anfrage, FAHRZEUG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeFahrzeugEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('FAHRZEUGE_DATEI_UNGUELTIG', 'Ungültige Fahrzeugdaten.', 400);
  }
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE fahrzeuge
         SET bezeichnung = ?, funkrufname = ?, kennzeichen = ?, fahrgestellnummer = ?,
             eigentuemer = ?, bemerkung = ?, wartungstermine = ?, geaendert_am = ?,
             geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.bezeichnung,
      eingabe.funkrufname,
      eingabe.kennzeichen,
      eingabe.fahrgestellnummer,
      eingabe.eigentuemer,
      eingabe.bemerkung,
      JSON.stringify(eingabe.wartungstermine),
      jetzt,
      identitaet.email,
      id,
      erwarteteVersion,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    // Entweder unbekannte id oder veraltete Version – beides ist für die
    // aufrufende Seite derselbe Fall: neu laden und zusammenführen.
    return fehlerAntwort(
      'FAHRZEUGE_KONFLIKT',
      'Das Fahrzeug wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return jsonAntwort({ ...eingabe, geaendertAm: jetzt, geaendertVon: identitaet.email }, 200, {
    ETag: starkesEtag(erwarteteVersion + 1),
  });
}

async function listeAblesungen(db: D1Database, fahrzeugId: string): Promise<Response> {
  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ id: string }>();
  if (!fahrzeug) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  const ergebnis = await db
    .prepare('SELECT * FROM ablesungen WHERE fahrzeug_id = ? ORDER BY abgelesen_am ASC')
    .bind(fahrzeugId)
    .all<AblesungZeile>();
  return jsonAntwort({ ablesungen: ergebnis.results.map(zuAblesungJson) });
}

async function ergaenzeAblesung(
  anfrage: Request,
  db: D1Database,
  fahrzeugId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const koerper = await lesePruefeKoerper(anfrage, ABLESUNG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAblesungEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('FAHRZEUGE_DATEI_UNGUELTIG', 'Ungültige Ablesungsdaten.', 400);
  }
  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ id: string }>();
  if (!fahrzeug) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  if (eingabe.korrigiert !== null) {
    const korrigierte = await db
      .prepare('SELECT id FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')
      .bind(eingabe.korrigiert, fahrzeugId)
      .first<{ id: string }>();
    if (!korrigierte) {
      return fehlerAntwort(
        'FAHRZEUGE_DATEI_UNGUELTIG',
        'Die zu korrigierende Ablesung existiert nicht für dieses Fahrzeug.',
        400,
      );
    }
  }
  const id = crypto.randomUUID();
  const erfasstAm = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO ablesungen
         (id, fahrzeug_id, abgelesen_am, stand, erfasst_am, erfasst_von, quelle, korrigiert, bemerkung)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      fahrzeugId,
      eingabe.abgelesenAm,
      eingabe.stand,
      erfasstAm,
      identitaet.email,
      eingabe.quelle,
      eingabe.korrigiert,
      eingabe.bemerkung,
    )
    .run();
  return jsonAntwort(
    {
      id,
      fahrzeugId,
      abgelesenAm: eingabe.abgelesenAm,
      stand: eingabe.stand,
      erfasstAm,
      erfasstVon: identitaet.email,
      quelle: eingabe.quelle,
      korrigiert: eingabe.korrigiert,
      bemerkung: eingabe.bemerkung,
    },
    201,
  );
}

/**
 * Gedruckte QR-Codes zeigen auf feste Kurzpfade statt auf die Hash-Route
 * (siehe docs/konzept-fahrzeuge.md, Abschnitt 4): ändert sich das
 * Angular-Routing, ändert sich nur diese eine Stelle, nicht jeder Aufkleber.
 * Nur GET; Access-Prüfung erfolgt bereits vorher im Router.
 */
export function kurzlinkWeiterleitung(pfad: string): Response | null {
  const uebersicht = new RegExp(`^/f/(${UUID_MUSTER})$`, 'i').exec(pfad);
  if (uebersicht) {
    return neueWeiterleitung(`/#/fahrzeuge/${uebersicht[1]}`);
  }
  const km = new RegExp(`^/f/(${UUID_MUSTER})/km$`, 'i').exec(pfad);
  if (km) {
    // Kennzeichnet die Erfassung als über den gedruckten Aufkleber ausgelöst,
    // damit das Feld `quelle` einer Ablesung nicht geraten werden muss.
    return neueWeiterleitung(`/#/fahrzeuge/${km[1]}/km?quelle=qr`);
  }
  return null;
}

function neueWeiterleitung(ziel: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: ziel, 'Cache-Control': 'no-store' },
  });
}
