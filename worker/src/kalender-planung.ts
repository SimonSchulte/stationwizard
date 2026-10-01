import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag, versionAusEtag } from './etag';
import { istNichtleererText, istObjekt, istText, leseJsonBegrenzt } from './json-lesen';

/**
 * Kalender (früher Ausbildungsplanung): Jahresblätter und die jahresübergreifenden
 * „Offenen Ideen“ liegen in einer eigenen D1-Datenbank (KALENDER_DB), Schema in
 * `worker/migrations/kalender/0012_kalender.sql`. Die Excel-Arbeitsmappe ist nur noch
 * Importquelle (einmalige Übernahme) und lokaler Download.
 *
 * Dokumentartig wie `angebote`: eine Zeile je Jahr mit Terminen und KatS-Themen
 * als JSON und eigener Version, dazu eine einzige Zeile für die Ideen. Der Store
 * im Frontend arbeitet ohnehin auf ganzen Dokumenten mit Undo; ein Speichern ist
 * so eine einzige D1-Schreibung je geändertem Jahr.
 *
 * Rechte vorerst alle, Rollen später: jede geprüfte Identität darf lesen und
 * schreiben, wie beim Angebotswesen.
 */
export interface KalenderKonfiguration {
  KALENDER_DB?: D1Database;
}

export const KALENDER_PFAD = '/api/kalender';
const JAHRE_PFAD = '/api/kalender/jahre';
const JAHR_PFAD = /^\/api\/kalender\/jahre\/(\d{4})$/;
const IDEEN_PFAD = '/api/kalender/ideen';
const MIGRATION_PFAD = '/api/kalender/migration';

const IDEEN_ID = 'offene-ideen';

// Ein Jahresblatt hat gut fünfzig Diensttage und einige Termine mehr; die Grenzen
// lassen großzügig Luft, bleiben aber weit unter der D1-Zeilengrenze.
const JAHR_KOERPER_GRENZE = 512 * 1024;
const MIGRATION_KOERPER_GRENZE = 2 * 1024 * 1024;
const MAX_TERMINE = 2000;
const MAX_KATS_THEMEN = 500;
const MAX_JAHRE = 50;
const MAX_TEXT = 10_000;
const MAX_KENNUNG = 100;

/*
 * Die festen Wertelisten stehen zweimal: hier und in
 * `src/app/ausbildung/models/plan.model.ts`. Der Worker kann das Frontend nicht
 * importieren; beide Fassungen sind gemeinsam zu ändern.
 */
const KATEGORIEN = new Set(['', 'SAN', 'Bt/Vp', 'TeSi/Iuk', 'UF', 'Führung', 'Sonstiges']);
const TERMIN_TYPEN = new Set(['dienst', 'termin']);
const NACHWEIS_KEYS = new Set([
  'stvo',
  'elektro',
  'gas',
  'ifsg',
  'fsKontrolle',
  'aed',
  'bls',
  'fahreinweisung',
  'ufSitzung',
  'gesellschaft',
]);

const ISO_DATUM = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ZEIT = /^(([01]\d|2[0-3]):[0-5]\d)?$/;

/* -------------------------------------------------------------------- */
/* Prüfung                                                               */
/* -------------------------------------------------------------------- */

export interface TerminEingabe {
  id: string;
  datum: string | null;
  datumBis: string | null;
  beginnZeit: string;
  endeZeit: string;
  typ: string;
  hinweis: string;
  kategorie: string;
  thema: string;
  ausbilder: string;
  katsThemaId: string | null;
  katsTitel: string;
  katsPflicht: boolean;
  hgmInhalt: string;
  hgmTitel: string;
  nachweise: string[];
  material: string;
  anforderungen: string;
  notizen: string;
}

interface KatsThemaEingabe {
  id: string;
  nummer: string;
  titel: string;
  beschreibung: string;
  pflicht: boolean;
}

export interface JahrEingabe {
  jahr: number;
  titel: string;
  termine: TerminEingabe[];
  katsThemen: KatsThemaEingabe[];
}

const TEXTFELDER = [
  'hinweis',
  'thema',
  'ausbilder',
  'katsTitel',
  'hgmInhalt',
  'hgmTitel',
  'material',
  'anforderungen',
  'notizen',
] as const;

function istKurzerText(wert: unknown, grenze = MAX_TEXT): wert is string {
  return istText(wert) && wert.length <= grenze;
}

function istKennung(wert: unknown): wert is string {
  return istNichtleererText(wert) && wert.length <= MAX_KENNUNG;
}

function istGueltigesDatum(wert: string): boolean {
  if (!ISO_DATUM.test(wert)) return false;
  const jahr = Number(wert.slice(0, 4));
  const monat = Number(wert.slice(5, 7));
  const tag = Number(wert.slice(8, 10));
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  return datum.getUTCMonth() === monat - 1 && datum.getUTCDate() === tag;
}

/**
 * Prüft einen Termin. `geplant` verlangt ein Datum (Jahresblatt), sonst muss es
 * fehlen (Offene Ideen). Unbekannte Felder werden verworfen, nicht übernommen.
 */
export function pruefeTermin(wert: unknown, geplant: boolean): TerminEingabe | null {
  if (!istObjekt(wert) || !istKennung(wert['id'])) return null;
  const datum = wert['datum'];
  const datumBis = wert['datumBis'];
  if (geplant) {
    if (!istText(datum) || !istGueltigesDatum(datum)) return null;
    if (datumBis !== null && (!istText(datumBis) || !istGueltigesDatum(datumBis))) return null;
    if (istText(datumBis) && datumBis <= datum) return null;
  } else if (datum !== null || datumBis !== null) {
    return null;
  }
  const beginnZeit = wert['beginnZeit'];
  const endeZeit = wert['endeZeit'];
  if (!istText(beginnZeit) || !ZEIT.test(beginnZeit)) return null;
  if (!istText(endeZeit) || !ZEIT.test(endeZeit)) return null;
  const typ = wert['typ'];
  if (!istText(typ) || !TERMIN_TYPEN.has(typ)) return null;
  const kategorie = wert['kategorie'];
  if (!istText(kategorie) || !KATEGORIEN.has(kategorie)) return null;
  const katsThemaId = wert['katsThemaId'];
  if (katsThemaId !== null && !istKennung(katsThemaId)) return null;
  if (typeof wert['katsPflicht'] !== 'boolean') return null;
  const nachweise = wert['nachweise'];
  if (
    !Array.isArray(nachweise) ||
    !nachweise.every((n) => istText(n) && NACHWEIS_KEYS.has(n)) ||
    new Set(nachweise).size !== nachweise.length
  ) {
    return null;
  }
  const texte = {} as Record<(typeof TEXTFELDER)[number], string>;
  for (const feld of TEXTFELDER) {
    const text = wert[feld];
    if (!istKurzerText(text)) return null;
    texte[feld] = text;
  }
  return {
    id: wert['id'],
    datum: geplant ? (datum as string) : null,
    datumBis: geplant ? (datumBis as string | null) : null,
    beginnZeit,
    endeZeit,
    typ,
    hinweis: texte.hinweis,
    kategorie,
    thema: texte.thema,
    ausbilder: texte.ausbilder,
    katsThemaId: katsThemaId as string | null,
    katsTitel: texte.katsTitel,
    katsPflicht: wert['katsPflicht'],
    hgmInhalt: texte.hgmInhalt,
    hgmTitel: texte.hgmTitel,
    nachweise: nachweise as string[],
    material: texte.material,
    anforderungen: texte.anforderungen,
    notizen: texte.notizen,
  };
}

function pruefeKatsThema(wert: unknown): KatsThemaEingabe | null {
  if (
    !istObjekt(wert) ||
    !istKennung(wert['id']) ||
    !istKurzerText(wert['nummer'], MAX_KENNUNG) ||
    !istKurzerText(wert['titel']) ||
    !istKurzerText(wert['beschreibung']) ||
    typeof wert['pflicht'] !== 'boolean'
  ) {
    return null;
  }
  return {
    id: wert['id'],
    nummer: wert['nummer'],
    titel: wert['titel'],
    beschreibung: wert['beschreibung'],
    pflicht: wert['pflicht'],
  };
}

function pruefeListe<T extends { id: string }>(
  wert: unknown,
  grenze: number,
  pruefe: (eintrag: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(wert) || wert.length > grenze) return null;
  const ergebnis: T[] = [];
  const ids = new Set<string>();
  for (const eintrag of wert) {
    const geprueft = pruefe(eintrag);
    if (!geprueft) return null;
    if (ids.has(geprueft.id)) return null;
    ids.add(geprueft.id);
    ergebnis.push(geprueft);
  }
  return ergebnis;
}

export function pruefeJahr(wert: unknown): JahrEingabe | null {
  if (!istObjekt(wert)) return null;
  const jahr = wert['jahr'];
  if (typeof jahr !== 'number' || !Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    return null;
  }
  if (!istKurzerText(wert['titel'], 200)) return null;
  const termine = pruefeListe(wert['termine'], MAX_TERMINE, (t) => pruefeTermin(t, true));
  const katsThemen = pruefeListe(wert['katsThemen'], MAX_KATS_THEMEN, pruefeKatsThema);
  if (!termine || !katsThemen) return null;
  return { jahr, titel: wert['titel'], termine, katsThemen };
}

function pruefeIdeen(wert: unknown): TerminEingabe[] | null {
  if (!istObjekt(wert)) return null;
  return pruefeListe(wert['termine'], MAX_TERMINE, (t) => pruefeTermin(t, false));
}

/* -------------------------------------------------------------------- */
/* Lesen                                                                 */
/* -------------------------------------------------------------------- */

interface JahrZeile {
  jahr: number;
  titel: string;
  termine: string;
  kats_themen: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

interface IdeenZeile {
  termine: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuJahrJson(zeile: JahrZeile): Record<string, unknown> {
  return {
    jahr: zeile.jahr,
    titel: zeile.titel,
    // In den Spalten liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    termine: JSON.parse(zeile.termine),
    katsThemen: JSON.parse(zeile.kats_themen),
    version: zeile.version,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

function zuIdeenJson(zeile: IdeenZeile): Record<string, unknown> {
  return {
    termine: JSON.parse(zeile.termine),
    version: zeile.version,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

/**
 * Der gesamte Kalender in einem Aufruf: alle Jahre und die Ideen, je mit ihrer
 * Version für ein späteres `If-Match`. Ein Aufruf statt einer Liste plus einem
 * Abruf je Jahr (Free-Tier). `ideen` ist `null`, solange nie gespeichert wurde.
 */
async function leseKalender(db: D1Database): Promise<Response> {
  const [jahre, ideen] = await db.batch<JahrZeile | IdeenZeile>([
    db.prepare('SELECT * FROM kalender_jahre ORDER BY jahr'),
    db.prepare('SELECT * FROM kalender_ideen WHERE id = ?').bind(IDEEN_ID),
  ]);
  const ideenZeile = ((ideen?.results ?? []) as IdeenZeile[])[0] ?? null;
  return jsonAntwort({
    jahre: ((jahre?.results ?? []) as JahrZeile[]).map(zuJahrJson),
    ideen: ideenZeile ? zuIdeenJson(ideenZeile) : null,
  });
}

/* -------------------------------------------------------------------- */
/* Schreiben                                                             */
/* -------------------------------------------------------------------- */

function vorbedingungFehlt(nachricht: string): Response {
  return fehlerAntwort('KALENDER_VORBEDINGUNG_FEHLT', nachricht, 428);
}

function konflikt(): Response {
  return fehlerAntwort(
    'KALENDER_KONFLIKT',
    'Der Kalender wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
    412,
  );
}

function ungueltig(): Response {
  return fehlerAntwort('KALENDER_DATEN_UNGUELTIG', 'Ungültige Kalenderdaten.', 400);
}

/** Liest `If-Match` als Version; `Response` bei fehlender oder unlesbarer Angabe. */
function erwarteteVersion(anfrage: Request): number | Response {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return vorbedingungFehlt('Zum Speichern zuerst laden und die aktuelle Version mitsenden.');
  }
  if (anfrage.headers.has('If-None-Match')) {
    return fehlerAntwort(
      'KALENDER_VORBEDINGUNG_UNGUELTIG',
      'If-Match und If-None-Match nicht kombinieren.',
      400,
    );
  }
  const version = versionAusEtag(ifMatch);
  if (version === null) {
    return fehlerAntwort('KALENDER_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  return version;
}

function verlangtNeuanlage(anfrage: Request): Response | null {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return vorbedingungFehlt('Zum Anlegen ausdrücklich If-None-Match: * senden.');
  }
  if (anfrage.headers.has('If-Match')) {
    return fehlerAntwort(
      'KALENDER_VORBEDINGUNG_UNGUELTIG',
      'If-Match und If-None-Match nicht kombinieren.',
      400,
    );
  }
  return null;
}

function jahrAntwort(
  eingabe: JahrEingabe,
  version: number,
  jetzt: string,
  identitaet: Benutzer,
  status: number,
): Response {
  return jsonAntwort(
    { ...eingabe, version, geaendertAm: jetzt, geaendertVon: identitaet.email },
    status,
    { ETag: starkesEtag(version) },
  );
}

async function legeJahrAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = verlangtNeuanlage(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, JAHR_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeJahr(koerper.inhalt);
  if (!eingabe) return ungueltig();
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO kalender_jahre
           (jahr, titel, termine, kats_themen, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.jahr,
        eingabe.titel,
        JSON.stringify(eingabe.termine),
        JSON.stringify(eingabe.katsThemen),
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return konflikt();
  }
  return jahrAntwort(eingabe, 1, jetzt, identitaet, 201);
}

async function aktualisiereJahr(
  anfrage: Request,
  db: D1Database,
  jahr: number,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, JAHR_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeJahr(koerper.inhalt);
  if (!eingabe || eingabe.jahr !== jahr) return ungueltig();
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE kalender_jahre
       SET titel = ?, termine = ?, kats_themen = ?, geaendert_am = ?, geaendert_von = ?,
           version = version + 1
       WHERE jahr = ? AND version = ?`,
    )
    .bind(
      eingabe.titel,
      JSON.stringify(eingabe.termine),
      JSON.stringify(eingabe.katsThemen),
      jetzt,
      identitaet.email,
      jahr,
      version,
    )
    .run();
  if (ergebnis.meta.changes === 0) return konflikt();
  return jahrAntwort(eingabe, version + 1, jetzt, identitaet, 200);
}

/**
 * Die Ideen-Zeile entsteht beim ersten Speichern (`If-None-Match: *`) oder bei
 * der Migration; danach nur noch mit `If-Match`.
 */
async function speichereIdeen(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const neu = anfrage.headers.get('If-None-Match') === '*';
  const vorbedingung = neu ? verlangtNeuanlage(anfrage) : null;
  if (vorbedingung) return vorbedingung;
  const version = neu ? 0 : erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, JAHR_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const termine = pruefeIdeen(koerper.inhalt);
  if (!termine) return ungueltig();
  const jetzt = new Date().toISOString();
  if (neu) {
    try {
      await db
        .prepare(
          `INSERT INTO kalender_ideen (id, termine, geaendert_am, geaendert_von, version)
           VALUES (?, ?, ?, ?, 1)`,
        )
        .bind(IDEEN_ID, JSON.stringify(termine), jetzt, identitaet.email)
        .run();
    } catch {
      return konflikt();
    }
  } else {
    const ergebnis = await db
      .prepare(
        `UPDATE kalender_ideen
         SET termine = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(JSON.stringify(termine), jetzt, identitaet.email, IDEEN_ID, version)
      .run();
    if (ergebnis.meta.changes === 0) return konflikt();
  }
  const neueVersion = version + 1;
  return jsonAntwort(
    { termine, version: neueVersion, geaendertAm: jetzt, geaendertVon: identitaet.email },
    neu ? 201 : 200,
    { ETag: starkesEtag(neueVersion) },
  );
}

/**
 * Einmalige Übernahme der Excel-Arbeitsmappe: alle Jahre und die Ideen in einer
 * `db.batch()` – entweder vollständig oder gar nicht. Nur solange der Kalender
 * leer ist; danach 409, damit ein zweiter Klick nie einen gepflegten Stand
 * überschreibt. Ein Rennen zweier Übernahmen endet an den Primärschlüsseln.
 */
async function migriere(anfrage: Request, db: D1Database, identitaet: Benutzer): Promise<Response> {
  const vorbedingung = verlangtNeuanlage(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, MIGRATION_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const inhalt = koerper.inhalt;
  if (!istObjekt(inhalt) || !Array.isArray(inhalt['jahre'])) return ungueltig();
  if (inhalt['jahre'].length > MAX_JAHRE) return ungueltig();
  const jahre: JahrEingabe[] = [];
  for (const wert of inhalt['jahre']) {
    const jahr = pruefeJahr(wert);
    if (!jahr || jahre.some((j) => j.jahr === jahr.jahr)) return ungueltig();
    jahre.push(jahr);
  }
  const ideen = pruefeIdeen({ termine: inhalt['ideen'] });
  if (!ideen) return ungueltig();

  const vorhanden = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM kalender_jahre) + (SELECT COUNT(*) FROM kalender_ideen)
         AS anzahl`,
    )
    .first<{ anzahl: number }>();
  if ((vorhanden?.anzahl ?? 0) > 0) return bereitsBefuellt();

  const jetzt = new Date().toISOString();
  const anweisungen = jahre.map((jahr) =>
    db
      .prepare(
        `INSERT INTO kalender_jahre
           (jahr, titel, termine, kats_themen, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        jahr.jahr,
        jahr.titel,
        JSON.stringify(jahr.termine),
        JSON.stringify(jahr.katsThemen),
        jetzt,
        identitaet.email,
      ),
  );
  anweisungen.push(
    db
      .prepare(
        `INSERT INTO kalender_ideen (id, termine, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .bind(IDEEN_ID, JSON.stringify(ideen), jetzt, identitaet.email),
  );
  try {
    await db.batch(anweisungen);
  } catch {
    return bereitsBefuellt();
  }
  return jsonAntwort(
    {
      jahre: jahre.map((jahr) => ({
        ...jahr,
        version: 1,
        geaendertAm: jetzt,
        geaendertVon: identitaet.email,
      })),
      ideen: { termine: ideen, version: 1, geaendertAm: jetzt, geaendertVon: identitaet.email },
    },
    201,
  );
}

function bereitsBefuellt(): Response {
  return fehlerAntwort(
    'KALENDER_BEREITS_BEFUELLT',
    'Der Kalender enthält bereits Daten; die Übernahme ist nur einmal möglich.',
    409,
  );
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
    return fehlerAntwort('KALENDER_INHALTSTYP_UNGUELTIG', 'Unzulässiger Inhaltstyp.', 415);
  }
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 10_000);
  try {
    const ergebnis = await leseJsonBegrenzt(anfrage, grenze, abbruch.signal);
    if (!ergebnis.erfolg) {
      return ergebnis.ursache === 'zu-gross'
        ? fehlerAntwort('KALENDER_DATEN_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
        : fehlerAntwort('KALENDER_DATEN_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
    }
    return { inhalt: ergebnis.inhalt };
  } finally {
    clearTimeout(zeitlimit);
  }
}

function methodeNichtErlaubt(erlaubt: string): Response {
  return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
    Allow: erlaubt,
  });
}

/**
 * Feste Kalender-Endpunkte hinter der bereits geprüften Anmeldung. Keine
 * Query-Parameter, keine frei wählbaren Pfade, kein Löschen. `identitaet`
 * stammt ausschließlich aus dem verifizierten Access-JWT.
 */
export async function verarbeiteKalender(
  anfrage: Request,
  umgebung: KalenderKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.KALENDER_DB;
  if (!db) {
    return fehlerAntwort(
      'KALENDER_KONFIGURATION_FEHLT',
      'Die Kalender-Datenbank ist noch nicht eingerichtet.',
      503,
    );
  }

  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('KALENDER_PFAD_UNGUELTIG', 'Kalender-Endpunkt nicht gefunden.', 404);
  }

  try {
    if (url.pathname === KALENDER_PFAD) {
      if (anfrage.method === 'GET') return await leseKalender(db);
      return methodeNichtErlaubt('GET');
    }
    if (url.pathname === JAHRE_PFAD) {
      if (anfrage.method === 'POST') return await legeJahrAn(anfrage, db, identitaet);
      return methodeNichtErlaubt('POST');
    }
    const jahr = JAHR_PFAD.exec(url.pathname)?.[1];
    if (jahr) {
      if (anfrage.method === 'PUT')
        return await aktualisiereJahr(anfrage, db, Number(jahr), identitaet);
      return methodeNichtErlaubt('PUT');
    }
    if (url.pathname === IDEEN_PFAD) {
      if (anfrage.method === 'PUT') return await speichereIdeen(anfrage, db, identitaet);
      return methodeNichtErlaubt('PUT');
    }
    if (url.pathname === MIGRATION_PFAD) {
      if (anfrage.method === 'POST') return await migriere(anfrage, db, identitaet);
      return methodeNichtErlaubt('POST');
    }
    return fehlerAntwort('KALENDER_PFAD_UNGUELTIG', 'Kalender-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('KALENDER_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'KALENDER_DB_FEHLER',
      'Die Kalenderdaten konnten nicht verarbeitet werden.',
      502,
    );
  }
}
