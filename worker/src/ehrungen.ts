import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag, versionAusEtag } from './etag';
import { istNichtleererText, istObjekt, leseJsonBegrenzt } from './json-lesen';

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
export interface EhrungenKonfiguration {
  BENUTZER_DB?: D1Database;
}

export const EHRUNGEN_PFAD = '/api/personal/ehrungen';
const EHRUNGEN_IMPORT_PFAD = '/api/personal/ehrungen/import';
const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const EINZEL_PFAD = new RegExp(`^${EHRUNGEN_PFAD}/(${UUID_MUSTER})$`, 'i');
const VERLAUF_PFAD = new RegExp(`^${EHRUNGEN_PFAD}/(${UUID_MUSTER})/aenderungen$`, 'i');
const VERLAUF_GRENZE = 200;

/** Feste Schlüsselliste in kanonischer Reihenfolge; Gegenstück im Client. */
export const EHRUNG_SCHLUESSEL = [
  'bronze',
  'silber',
  'gold',
  'jubilaeum-25',
  'jubilaeum-40',
  'jubilaeum-50',
  'jubilaeum-60',
  'uhr-30',
  'uhr-40',
  'uhr-50',
  'ehrenzeichen',
  'ehrenzeichen-bande',
  'ehrennadel',
] as const;

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const EINZEL_GRENZE = 4 * 1024;
const IMPORT_GRENZE = 512 * 1024;
const IMPORT_MAXIMUM = 1000;
const STUNDEN_MAXIMUM = 1_000_000;

/** Vergleichsform für den Namensabgleich; Gegenstück im Client. */
export function personSchluessel(nachname: string, vorname: string): string {
  const glatt = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${glatt(nachname)}|${glatt(vorname)}`;
}

function istEchtesDatum(text: string): boolean {
  if (!ISO_DATUM.test(text)) return false;
  const datum = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(datum.getTime()) && datum.toISOString().slice(0, 10) === text;
}

export function wirksameStunden(importiert: number, manuell: number | null): number {
  return Math.max(importiert, manuell ?? 0);
}

function pruefeStunden(wert: unknown): number | null {
  if (typeof wert !== 'number' || !Number.isFinite(wert) || wert < 0 || wert > STUNDEN_MAXIMUM) {
    return null;
  }
  return Math.round(wert * 100) / 100;
}

/** Jahr der Vergabe; `null` heißt „erhalten, Jahr unbekannt“ (Bestände aus mehreren Aktenlagen). */
const JAHR_MINIMUM = 1900;
const JAHR_MAXIMUM = 2200;

export type Erhalten = Partial<Record<(typeof EHRUNG_SCHLUESSEL)[number], number | null>>;

/** Erhaltene Auszeichnungen mit Vergabejahr, in kanonischer Reihenfolge; unbekannte Schlüssel lehnen ab. */
function pruefeErhalten(wert: unknown): Erhalten | null {
  if (!istObjekt(wert)) return null;
  const bekannt = new Set<string>(EHRUNG_SCHLUESSEL);
  if (Object.keys(wert).some((schluessel) => !bekannt.has(schluessel))) return null;
  const ergebnis: Erhalten = {};
  for (const schluessel of EHRUNG_SCHLUESSEL) {
    if (!Object.hasOwn(wert, schluessel)) continue;
    const jahr = wert[schluessel];
    if (jahr === null) {
      ergebnis[schluessel] = null;
    } else if (
      typeof jahr === 'number' &&
      Number.isInteger(jahr) &&
      jahr >= JAHR_MINIMUM &&
      jahr <= JAHR_MAXIMUM
    ) {
      ergebnis[schluessel] = jahr;
    } else {
      return null;
    }
  }
  return ergebnis;
}

interface PersonZeile {
  id: string;
  nachname: string;
  vorname: string;
  schluessel: string;
  stunden: number;
  stunden_manuell: number | null;
  eintrittsdatum: string | null;
  besondere_verdienste: number;
  erhalten: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

/** Liest die Spalte; die frühere Liste fester Schlüssel (ohne Jahr) wird als „Jahr unbekannt“ gelesen. */
function leseErhaltenSpalte(text: string): Erhalten {
  try {
    const roh: unknown = JSON.parse(text);
    if (Array.isArray(roh)) {
      return pruefeErhalten(Object.fromEntries(roh.map((schluessel) => [schluessel, null]))) ?? {};
    }
    return pruefeErhalten(roh) ?? {};
  } catch {
    return {};
  }
}

function zuJson(zeile: PersonZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    nachname: zeile.nachname,
    vorname: zeile.vorname,
    // `stunden` ist die wirksame Zahl: die größere von Import und manuellem Nachtrag.
    stunden: wirksameStunden(zeile.stunden, zeile.stunden_manuell),
    stundenImport: zeile.stunden,
    // `?? null`: eine noch nicht angewendete Migration 0015 darf die Liste nicht unlesbar machen.
    stundenManuell: zeile.stunden_manuell ?? null,
    eintrittsdatum: zeile.eintrittsdatum,
    besondereVerdienste: zeile.besondere_verdienste === 1,
    erhalten: leseErhaltenSpalte(zeile.erhalten),
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
    // Wie beim Preiskatalog: viele kleine, inline editierte Zeilen, deshalb
    // die Version in der Liste statt eines Einzelabrufs vor jeder Änderung.
    version: zeile.version,
  };
}

async function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 10_000);
  try {
    const ergebnis = await leseJsonBegrenzt(anfrage, grenze, abbruch.signal);
    if (!ergebnis.erfolg) {
      return ergebnis.ursache === 'zu-gross'
        ? fehlerAntwort('EHRUNGEN_DATEI_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
        : fehlerAntwort('EHRUNGEN_DATEI_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
    }
    return { inhalt: ergebnis.inhalt };
  } finally {
    clearTimeout(zeitlimit);
  }
}

async function liste(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM ehrungen_personen ORDER BY nachname, vorname')
    .all<PersonZeile>();
  return jsonAntwort({ personen: ergebnis.results.map(zuJson) });
}

async function aktualisiere(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'EHRUNGEN_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const erwarteteVersion = versionAusEtag(ifMatch);
  if (erwarteteVersion === null) {
    return fehlerAntwort('EHRUNGEN_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  const koerper = await lesePruefeKoerper(anfrage, EINZEL_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = koerper.inhalt;
  const erhalten = istObjekt(eingabe) ? pruefeErhalten(eingabe['erhalten']) : null;
  const manuell = istObjekt(eingabe)
    ? eingabe['stundenManuell'] === null
      ? null
      : pruefeStunden(eingabe['stundenManuell'])
    : null;
  if (
    !istObjekt(eingabe) ||
    erhalten === null ||
    (eingabe['stundenManuell'] !== null && manuell === null) ||
    typeof eingabe['besondereVerdienste'] !== 'boolean' ||
    !(
      eingabe['eintrittsdatum'] === null ||
      (typeof eingabe['eintrittsdatum'] === 'string' && istEchtesDatum(eingabe['eintrittsdatum']))
    )
  ) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültige Angaben.', 400);
  }
  const bestehend = await db
    .prepare('SELECT version, stunden, stunden_manuell FROM ehrungen_personen WHERE id = ?')
    .bind(id)
    .first<{ version: number; stunden: number; stunden_manuell: number | null }>();
  if (!bestehend) {
    return fehlerAntwort('EHRUNGEN_NICHT_GEFUNDEN', 'Eintrag nicht gefunden.', 404);
  }
  const konflikt = () =>
    fehlerAntwort(
      'EHRUNGEN_KONFLIKT',
      'Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  if (bestehend.version !== erwarteteVersion) return konflikt();

  const jetzt = new Date().toISOString();
  const anweisungen = [
    db
      .prepare(
        `UPDATE ehrungen_personen
         SET eintrittsdatum = ?, besondere_verdienste = ?, erhalten = ?, stunden_manuell = ?,
             geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(
        eingabe['eintrittsdatum'],
        eingabe['besondereVerdienste'] ? 1 : 0,
        JSON.stringify(erhalten),
        manuell,
        jetzt,
        identitaet.email,
        id,
        erwarteteVersion,
      ),
  ];
  // Protokolleintrag nur bei tatsächlicher Änderung und nur, wenn die Änderung greift
  // (die Version nach dem Update ist die Bedingung der SELECT-Zeile).
  if (manuell !== bestehend.stunden_manuell) {
    anweisungen.push(
      protokollAnweisung(
        db,
        identitaet,
        jetzt,
        'stunden-manuell',
        bestehend.stunden_manuell,
        manuell,
        id,
        erwarteteVersion + 1,
      ),
    );
  }
  const ergebnisse = await db.batch(anweisungen);
  if (ergebnisse[0]?.meta.changes === 0) return konflikt();
  return jsonAntwort(
    {
      id,
      eintrittsdatum: eingabe['eintrittsdatum'],
      besondereVerdienste: eingabe['besondereVerdienste'],
      erhalten,
      stundenManuell: manuell,
      stunden: wirksameStunden(bestehend.stunden, manuell),
      geaendertAm: jetzt,
      geaendertVon: identitaet.email,
      version: erwarteteVersion + 1,
    },
    200,
    { ETag: starkesEtag(erwarteteVersion + 1) },
  );
}

/**
 * Zeile des Änderungsprotokolls. Nur der Worker schreibt sie; Zeitpunkt und Benutzer kommen aus der
 * geprüften Anmeldung. Die SELECT-Form bindet den Eintrag an die Version nach dem Schreiben: schlägt
 * das Update fehl (Rennen), entsteht auch kein Eintrag.
 */
function protokollAnweisung(
  db: D1Database,
  identitaet: Benutzer,
  zeitpunkt: string,
  feld: 'stunden-import' | 'stunden-manuell',
  alt: number | null,
  neu: number | null,
  personId: string,
  versionDanach: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO ehrungen_aenderungen (person_id, nachname, vorname, zeitpunkt, benutzer, feld, alt, neu)
       SELECT id, nachname, vorname, ?, ?, ?, ?, ? FROM ehrungen_personen WHERE id = ? AND version = ?`,
    )
    .bind(zeitpunkt, identitaet.email, feld, alt, neu, personId, versionDanach);
}

async function verlauf(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT zeitpunkt, benutzer, feld, alt, neu FROM ehrungen_aenderungen
       WHERE person_id = ? ORDER BY id DESC LIMIT ${VERLAUF_GRENZE}`,
    )
    .bind(id)
    .all<{
      zeitpunkt: string;
      benutzer: string;
      feld: string;
      alt: number | null;
      neu: number | null;
    }>();
  return jsonAntwort({ aenderungen: ergebnis.results });
}

async function loesche(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db.prepare('DELETE FROM ehrungen_personen WHERE id = ?').bind(id).run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('EHRUNGEN_NICHT_GEFUNDEN', 'Eintrag nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}

interface ImportEintrag {
  nachname: string;
  vorname: string;
  stunden: number | undefined;
  eintrittsdatum: string | undefined;
  version: number | undefined;
}

function pruefeImportEintrag(wert: unknown): ImportEintrag | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['nachname']) ||
    !istNichtleererText(wert['vorname'])
  ) {
    return null;
  }
  let stunden: number | undefined;
  if (wert['stunden'] !== undefined) {
    const geprueft = pruefeStunden(wert['stunden']);
    if (geprueft === null) return null;
    stunden = geprueft;
  }
  let eintrittsdatum: string | undefined;
  if (wert['eintrittsdatum'] !== undefined) {
    if (typeof wert['eintrittsdatum'] !== 'string' || !istEchtesDatum(wert['eintrittsdatum'])) {
      return null;
    }
    eintrittsdatum = wert['eintrittsdatum'];
  }
  let version: number | undefined;
  if (wert['version'] !== undefined) {
    if (!Number.isSafeInteger(wert['version']) || (wert['version'] as number) < 1) return null;
    version = wert['version'] as number;
  }
  if (stunden === undefined && eintrittsdatum === undefined) return null;
  return {
    nachname: wert['nachname'].trim().replace(/\s+/g, ' '),
    vorname: wert['vorname'].trim().replace(/\s+/g, ' '),
    stunden,
    eintrittsdatum,
    version,
  };
}

export type ImportErgebnis =
  'angelegt' | 'aktualisiert' | 'unveraendert' | 'nicht-gefunden' | 'konflikt' | 'doppelt';

/**
 * Sammelimport für Stunden (Textimport) und Eintrittsdaten (HiOrg): ein Aufruf
 * für den ganzen Bestand statt einer Anfrage je Person. Abgeglichen wird über
 * Nachname und Vorname. Geschrieben wird nur, was sich tatsächlich ändert;
 * eine vorhandene Person wird nur mit der Version aktualisiert, die der Client
 * gesehen hat (sonst `konflikt`, kein stilles Überschreiben). Ergebnis je
 * Eintrag in Eingabereihenfolge, damit ein einzelner Fehlschlag die übrigen
 * Zeilen nicht verwirft.
 */
async function importiere(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const koerper = await lesePruefeKoerper(anfrage, IMPORT_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = koerper.inhalt;
  if (
    !istObjekt(eingabe) ||
    typeof eingabe['anlegen'] !== 'boolean' ||
    !Array.isArray(eingabe['eintraege']) ||
    eingabe['eintraege'].length === 0 ||
    eingabe['eintraege'].length > IMPORT_MAXIMUM
  ) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültiger Import.', 400);
  }
  const eintraege = eingabe['eintraege'].map(pruefeImportEintrag);
  if (eintraege.some((eintrag) => eintrag === null)) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültiger Import.', 400);
  }
  const anlegen = eingabe['anlegen'];

  const bestand = await db.prepare('SELECT * FROM ehrungen_personen').all<PersonZeile>();
  const nachSchluessel = new Map(bestand.results.map((zeile) => [zeile.schluessel, zeile]));
  const gesehen = new Set<string>();
  const jetzt = new Date().toISOString();
  const ergebnisse: ImportErgebnis[] = [];
  const anweisungen: D1PreparedStatement[] = [];
  /** Position im Ergebnis, die zum jeweiligen Batch-Statement gehört (nur Updates können scheitern). */
  const zuordnung: number[] = [];

  for (const eintrag of eintraege as ImportEintrag[]) {
    const schluessel = personSchluessel(eintrag.nachname, eintrag.vorname);
    if (gesehen.has(schluessel)) {
      ergebnisse.push('doppelt');
      continue;
    }
    gesehen.add(schluessel);
    const vorhanden = nachSchluessel.get(schluessel);
    if (!vorhanden) {
      if (!anlegen) {
        ergebnisse.push('nicht-gefunden');
        continue;
      }
      const neueId = crypto.randomUUID();
      anweisungen.push(
        db
          .prepare(
            `INSERT INTO ehrungen_personen
               (id, nachname, vorname, schluessel, stunden, eintrittsdatum, besondere_verdienste,
                erhalten, geaendert_am, geaendert_von, version)
             VALUES (?, ?, ?, ?, ?, ?, 0, '{}', ?, ?, 1)`,
          )
          .bind(
            neueId,
            eintrag.nachname,
            eintrag.vorname,
            schluessel,
            eintrag.stunden ?? 0,
            eintrag.eintrittsdatum ?? null,
            jetzt,
            identitaet.email,
          ),
      );
      zuordnung.push(ergebnisse.length);
      // Die Erstanlage mit Stunden ist die erste Stundenzahl der Person und wird protokolliert.
      anweisungen.push(
        protokollAnweisung(
          db,
          identitaet,
          jetzt,
          'stunden-import',
          null,
          eintrag.stunden ?? 0,
          neueId,
          1,
        ),
      );
      zuordnung.push(-1);
      ergebnisse.push('angelegt');
      continue;
    }
    const neueStunden = eintrag.stunden ?? vorhanden.stunden;
    const neuesDatum = eintrag.eintrittsdatum ?? vorhanden.eintrittsdatum;
    if (neueStunden === vorhanden.stunden && neuesDatum === vorhanden.eintrittsdatum) {
      ergebnisse.push('unveraendert');
      continue;
    }
    if (eintrag.version !== vorhanden.version) {
      ergebnisse.push('konflikt');
      continue;
    }
    anweisungen.push(
      db
        .prepare(
          `UPDATE ehrungen_personen
           SET stunden = ?, eintrittsdatum = ?, geaendert_am = ?, geaendert_von = ?,
               version = version + 1
           WHERE id = ? AND version = ?`,
        )
        .bind(neueStunden, neuesDatum, jetzt, identitaet.email, vorhanden.id, vorhanden.version),
    );
    zuordnung.push(ergebnisse.length);
    if (neueStunden !== vorhanden.stunden) {
      anweisungen.push(
        protokollAnweisung(
          db,
          identitaet,
          jetzt,
          'stunden-import',
          vorhanden.stunden,
          neueStunden,
          vorhanden.id,
          vorhanden.version + 1,
        ),
      );
      zuordnung.push(-1);
    }
    ergebnisse.push('aktualisiert');
  }

  if (anweisungen.length > 0) {
    const batch = await db.batch(anweisungen);
    batch.forEach((einzel, index) => {
      const position = zuordnung[index];
      if (einzel.meta.changes === 0 && position !== undefined && position >= 0) {
        ergebnisse[position] = 'konflikt';
      }
    });
  }
  return jsonAntwort({ ergebnisse });
}

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
