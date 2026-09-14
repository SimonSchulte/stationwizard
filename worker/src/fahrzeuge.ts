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
const ABLESUNG_PFAD = new RegExp(
  `^/api/fahrzeuge/(${UUID_MUSTER})/ablesungen/(${UUID_MUSTER})$`,
  'i',
);
const AENDERUNGEN_PFAD = new RegExp(`^/api/fahrzeuge/(${UUID_MUSTER})/aenderungen$`, 'i');

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

interface AenderungZeile {
  id: string;
  fahrzeug_id: string;
  zeitpunkt: string;
  von: string;
  beschreibung: string;
}

function zuAenderungJson(zeile: AenderungZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    fahrzeugId: zeile.fahrzeug_id,
    zeitpunkt: zeile.zeitpunkt,
    von: zeile.von,
    beschreibung: zeile.beschreibung,
  };
}

const EIGENTUEMER_LABEL: Readonly<Record<string, string>> = {
  'land-nrw': 'Land NRW',
  bund: 'Bund',
  organisation: 'Organisation',
};

type StammdatenFeld =
  'bezeichnung' | 'funkrufname' | 'kennzeichen' | 'fahrgestellnummer' | 'eigentuemer';

const STAMMDATEN_FELDER: readonly { schluessel: StammdatenFeld; label: string }[] = [
  { schluessel: 'bezeichnung', label: 'Bezeichnung' },
  { schluessel: 'funkrufname', label: 'Funkrufname' },
  { schluessel: 'kennzeichen', label: 'Kennzeichen' },
  { schluessel: 'fahrgestellnummer', label: 'Fahrgestellnummer' },
  { schluessel: 'eigentuemer', label: 'Eigentümer' },
];

function feldAnzeige(schluessel: StammdatenFeld, wert: string | null): string {
  if (wert === null || wert === '') return '(leer)';
  return schluessel === 'eigentuemer' ? (EIGENTUEMER_LABEL[wert] ?? wert) : wert;
}

interface WartungFuerDiff {
  id: string;
  bezeichnung: string;
  faelligAm: string;
  erinnerungTage: number;
  erledigtAm: string | null;
}

function alsWartungFuerDiff(wert: unknown): WartungFuerDiff {
  const objekt = istObjekt(wert) ? wert : {};
  return {
    id: String(objekt['id'] ?? ''),
    bezeichnung: String(objekt['bezeichnung'] ?? ''),
    faelligAm: String(objekt['faelligAm'] ?? ''),
    erinnerungTage: Number(objekt['erinnerungTage'] ?? 0),
    erledigtAm: objekt['erledigtAm'] === null ? null : String(objekt['erledigtAm'] ?? ''),
  };
}

/**
 * Vergleicht Wartungstermine anhand ihrer `id`: neue, entfernte und
 * inhaltlich geänderte Termine werden je als eigene Protokollzeile erkannt.
 */
function diffWartungstermine(alt: unknown[], neu: unknown[]): string[] {
  const altListe = alt.map(alsWartungFuerDiff);
  const neuListe = neu.map(alsWartungFuerDiff);
  const zeilen: string[] = [];

  for (const termin of neuListe) {
    if (!altListe.some((t) => t.id === termin.id)) {
      zeilen.push(
        `Wartungstermin „${termin.bezeichnung}" hinzugefügt (fällig ${termin.faelligAm})`,
      );
    }
  }
  for (const termin of altListe) {
    if (!neuListe.some((t) => t.id === termin.id)) {
      zeilen.push(`Wartungstermin „${termin.bezeichnung}" entfernt`);
    }
  }
  for (const neuerTermin of neuListe) {
    const alterTermin = altListe.find((t) => t.id === neuerTermin.id);
    if (!alterTermin) continue;
    const details: string[] = [];
    if (alterTermin.bezeichnung !== neuerTermin.bezeichnung) {
      details.push(`Bezeichnung „${alterTermin.bezeichnung}" → „${neuerTermin.bezeichnung}"`);
    }
    if (alterTermin.faelligAm !== neuerTermin.faelligAm) {
      details.push(`Fälligkeit ${alterTermin.faelligAm} → ${neuerTermin.faelligAm}`);
    }
    if (alterTermin.erinnerungTage !== neuerTermin.erinnerungTage) {
      details.push(`Vorlauf ${alterTermin.erinnerungTage} → ${neuerTermin.erinnerungTage} Tage`);
    }
    if (alterTermin.erledigtAm !== neuerTermin.erledigtAm) {
      details.push(neuerTermin.erledigtAm !== null ? 'als erledigt markiert' : 'wieder geöffnet');
    }
    if (details.length > 0) {
      zeilen.push(`Wartungstermin „${neuerTermin.bezeichnung}": ${details.join(', ')}`);
    }
  }
  return zeilen;
}

/** Ermittelt die tatsächlichen Unterschiede für das Änderungsprotokoll – keine Zeile ohne echte Änderung. */
function diffFahrzeug(alt: FahrzeugZeile, neu: FahrzeugEingabe): string[] {
  const zeilen: string[] = [];
  for (const { schluessel, label } of STAMMDATEN_FELDER) {
    const altWert = alt[schluessel];
    const neuWert = neu[schluessel];
    if (altWert !== neuWert) {
      zeilen.push(
        `${label} geändert: ${feldAnzeige(schluessel, altWert)} → ${feldAnzeige(schluessel, neuWert)}`,
      );
    }
  }
  if (alt.bemerkung !== neu.bemerkung) {
    zeilen.push('Bemerkung geändert');
  }
  zeilen.push(
    ...diffWartungstermine(JSON.parse(alt.wartungstermine) as unknown[], neu.wartungstermine),
  );
  return zeilen;
}

/**
 * Schreibt einen Eintrag ins Änderungsprotokoll. Ausschließlich intern
 * aufgerufen: `von` und `zeitpunkt` kommen nie aus dem Anfragekörper, und es
 * gibt keinen Endpunkt, über den ein Client direkt in diese Tabelle schreiben
 * könnte (siehe docs/konzept-fahrzeuge.md, Abschnitt „Änderungsprotokoll").
 */
async function protokolliereAenderung(
  db: D1Database,
  fahrzeugId: string,
  von: string,
  beschreibung: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fahrzeug_aenderungen (id, fahrzeug_id, zeitpunkt, von, beschreibung)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), fahrzeugId, new Date().toISOString(), von, beschreibung)
    .run();
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

/**
 * Vergleichsform des Kennzeichens als SQL-Ausdruck: Großschreibung ohne
 * Leerzeichen, Bindestriche und Punkte. Wortgleich mit dem eindeutigen Index
 * aus `migrations/0003_kennzeichen_eindeutig.sql` – beide müssen zusammen
 * geändert werden, sonst weist die Vorabprüfung anderes ab als die Datenbank.
 */
const KENNZEICHEN_VERGLEICHSFORM = (spalte: string) =>
  `upper(replace(replace(replace(${spalte}, ' ', ''), '-', ''), '.', ''))`;

const KENNZEICHEN_BELEGT_ABFRAGE = `SELECT id FROM fahrzeuge
   WHERE ${KENNZEICHEN_VERGLEICHSFORM('kennzeichen')} = ${KENNZEICHEN_VERGLEICHSFORM('?')}
     AND ${KENNZEICHEN_VERGLEICHSFORM('kennzeichen')} <> ''
     AND id <> ?`;

/**
 * Meldet das Kennzeichen als vergeben, wenn es schon zu einem anderen Fahrzeug
 * gehört. Die Prüfung ist die freundliche Antwort; verbindlich ist der
 * eindeutige Index, der auch ein Rennen zwischen Prüfung und Schreiben abfängt.
 * Ein leeres Kennzeichen bleibt erlaubt und mehrfach möglich.
 */
async function kennzeichenVergeben(
  db: D1Database,
  kennzeichen: string,
  eigeneId: string,
): Promise<boolean> {
  const treffer = await db
    .prepare(KENNZEICHEN_BELEGT_ABFRAGE)
    .bind(kennzeichen, eigeneId)
    .first<{ id: string }>();
  return treffer !== null;
}

/** Verletzt der Datenbankfehler den eindeutigen Index auf dem Kennzeichen? */
function istKennzeichenKollision(fehler: unknown): boolean {
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  return (
    text.includes('idx_fahrzeuge_kennzeichen_eindeutig') || text.includes('fahrzeuge.kennzeichen')
  );
}

function kennzeichenVergebenAntwort(): Response {
  return fehlerAntwort(
    'FAHRZEUG_KENNZEICHEN_VERGEBEN',
    'Zu diesem Kennzeichen ist bereits ein Fahrzeug angelegt.',
    409,
  );
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
  if (await kennzeichenVergeben(db, eingabe.kennzeichen, eingabe.id)) {
    return kennzeichenVergebenAntwort();
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
  } catch (fehler) {
    // Der eindeutige Index kann hier zuschlagen, wenn zwischen Vorabprüfung
    // und INSERT jemand dasselbe Kennzeichen angelegt hat; sonst bleibt nur
    // der Primärschlüsselkonflikt, also dieselbe id.
    if (istKennzeichenKollision(fehler)) return kennzeichenVergebenAntwort();
    return fehlerAntwort(
      'FAHRZEUGE_KONFLIKT',
      'Ein Fahrzeug mit dieser Kennung existiert bereits.',
      412,
    );
  }
  await protokolliereAenderung(db, eingabe.id, identitaet.email, 'Fahrzeug angelegt');
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
  if (await kennzeichenVergeben(db, eingabe.kennzeichen, id)) {
    return kennzeichenVergebenAntwort();
  }
  // Für das Änderungsprotokoll: Stand vor dem Schreiben festhalten, sonst
  // wäre der Unterschied nach dem UPDATE nicht mehr feststellbar.
  const bisher = await db
    .prepare('SELECT * FROM fahrzeuge WHERE id = ?')
    .bind(id)
    .first<FahrzeugZeile>();
  const jetzt = new Date().toISOString();
  let ergebnis;
  try {
    ergebnis = await db
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
  } catch (fehler) {
    // Rennen zwischen Vorabprüfung und UPDATE: jemand anderes hat dasselbe
    // Kennzeichen belegt.
    if (istKennzeichenKollision(fehler)) return kennzeichenVergebenAntwort();
    throw fehler;
  }
  if (ergebnis.meta.changes === 0) {
    // Entweder unbekannte id oder veraltete Version – beides ist für die
    // aufrufende Seite derselbe Fall: neu laden und zusammenführen.
    return fehlerAntwort(
      'FAHRZEUGE_KONFLIKT',
      'Das Fahrzeug wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  if (bisher) {
    const aenderungen = diffFahrzeug(bisher, eingabe);
    if (aenderungen.length > 0) {
      await protokolliereAenderung(db, id, identitaet.email, aenderungen.join('\n'));
    }
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

async function listeAenderungen(db: D1Database, fahrzeugId: string): Promise<Response> {
  const fahrzeug = await db
    .prepare('SELECT id FROM fahrzeuge WHERE id = ?')
    .bind(fahrzeugId)
    .first<{ id: string }>();
  if (!fahrzeug) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  const ergebnis = await db
    .prepare('SELECT * FROM fahrzeug_aenderungen WHERE fahrzeug_id = ? ORDER BY zeitpunkt DESC')
    .bind(fahrzeugId)
    .all<AenderungZeile>();
  return jsonAntwort({ aenderungen: ergebnis.results.map(zuAenderungJson) });
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
  await protokolliereAenderung(
    db,
    fahrzeugId,
    identitaet.email,
    eingabe.korrigiert !== null
      ? `Kilometerstand korrigiert: ${eingabe.stand} km am ${eingabe.abgelesenAm}`
      : `Kilometerstand erfasst: ${eingabe.stand} km am ${eingabe.abgelesenAm}`,
  );
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
 * Löscht eine Ablesung unwiderruflich. Abweichend vom ursprünglichen Konzept
 * (`docs/konzept-fahrzeuge.md`, Abschnitt 8: „Kilometerstände sind
 * unveränderlich") jetzt auf ausdrücklichen fachlichen Wunsch möglich –
 * vorerst für jede geprüfte Identität, weil dem Modul noch keine Rollen
 * zugrunde liegen (siehe Konzept: „Rechte vorerst alle, Rollen später").
 * Eine spätere Rollenprüfung soll dies auf eine Admin-Rolle einschränken.
 * Eine Ablesung, auf die eine andere Ablesung per `korrigiert` verweist,
 * bleibt gesperrt, damit keine Korrektur ins Leere zeigt – die Korrektur
 * muss zuerst gelöscht werden.
 */
async function loescheAblesung(
  db: D1Database,
  fahrzeugId: string,
  ablesungId: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const ablesung = await db
    .prepare('SELECT * FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')
    .bind(ablesungId, fahrzeugId)
    .first<AblesungZeile>();
  if (!ablesung) {
    return fehlerAntwort('ABLESUNG_NICHT_GEFUNDEN', 'Ablesung nicht gefunden.', 404);
  }
  const korrektur = await db
    .prepare('SELECT id FROM ablesungen WHERE korrigiert = ?')
    .bind(ablesungId)
    .first<{ id: string }>();
  if (korrektur) {
    return fehlerAntwort(
      'ABLESUNG_HAT_KORREKTUR',
      'Diese Ablesung wurde bereits korrigiert. Zuerst die Korrektur löschen.',
      409,
    );
  }
  await db
    .prepare('DELETE FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')
    .bind(ablesungId, fahrzeugId)
    .run();
  await protokolliereAenderung(
    db,
    fahrzeugId,
    identitaet.email,
    `Kilometerstand gelöscht: ${ablesung.stand} km vom ${ablesung.abgelesen_am}`,
  );
  return new Response(null, { status: 204 });
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
