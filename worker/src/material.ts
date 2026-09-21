import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag, versionAusEtag } from './etag';
import { istNichtleererText, istObjekt, istText, leseJsonBegrenzt } from './json-lesen';
import { berlinerKalendertag } from './kalender';
import { Checkposition, VorlagenFach, pruefePositionen, zaehleKennzahlen } from './material-check';

/**
 * Materialverwaltung, Punkt "Fahrzeugcheck" (AP-M1).
 *
 * Liegt in FAHRZEUGE_DB und nicht in einer eigenen Datenbank: ein Behälter ist
 * kein eigenständiges Fachobjekt, sondern hängt an genau einem Fahrzeug, und
 * die Freigabeberechtigung eines Checks entsteht ausschließlich aus
 * `fahrzeuge.gruppe`. Die ausführliche Begründung steht im Kopf von
 * `worker/migrations/0010_material.sql` und in `docs/konzept-material.md`.
 *
 * Rechte vorerst alle, Rollen später: Vorlagen und Behälter darf jede geprüfte
 * Identität anlegen, ändern und löschen. Tatsächlich durchgesetzt wird eine
 * Rolle nur dort, wo eine ungeprüfte Angabe zu einem geprüften Stand wird –
 * bei der Freigabe einer öffentlichen Einreichung (siehe `rollen.ts`).
 */
export interface MaterialKonfiguration {
  FAHRZEUGE_DB?: D1Database;
}

const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_REGEX = new RegExp(`^${UUID_MUSTER}$`, 'i');

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
const CHECK_PFAD = new RegExp(`^/api/material/checks/(${UUID_MUSTER})$`, 'i');

export const HERKUENFTE = new Set(['seg', 'land', 'beide']);

// Eine Vorlage trägt ihren gesamten Baum in einer JSON-Spalte; die
// NFR-EE-Liste mit 125 Artikeln liegt bei rund 21 kB.
const VORLAGE_KOERPER_GRENZE = 256 * 1024;
const BEHAELTER_KOERPER_GRENZE = 8 * 1024;
// Rund 125 Positionen mit Verfallsdaten je Stück liegen bei etwa 35 kB; die
// Grenze lässt Luft, bleibt aber weit unter der Zeilengrenze von D1.
const CHECK_KOERPER_GRENZE = 256 * 1024;

const BEZEICHNUNG_MAX = 200;
const TEXT_MAX = 2000;
const EINHEIT_MAX = 20;
const SOLLMENGE_MAX = 999;

/* -------------------------------------------------------------------- */
/* Prüfvorlagen                                                          */
/* -------------------------------------------------------------------- */

interface ArtikelEingabe {
  id: string;
  bezeichnung: string;
  sollMenge: number;
  einheit: string;
  herkunft: string;
  verfallsdatumPflicht: boolean;
}

interface FachEingabe {
  id: string;
  bezeichnung: string;
  artikel: ArtikelEingabe[];
}

interface VorlageEingabe {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  grundlage: string;
  faecher: FachEingabe[];
}

function istKurztext(wert: unknown, grenze: number): wert is string {
  return istText(wert) && wert.length <= grenze;
}

function pruefeArtikel(wert: unknown): ArtikelEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istKurztext(wert['bezeichnung'], BEZEICHNUNG_MAX) ||
    typeof wert['sollMenge'] !== 'number' ||
    !Number.isInteger(wert['sollMenge']) ||
    wert['sollMenge'] < 1 ||
    wert['sollMenge'] > SOLLMENGE_MAX ||
    !istKurztext(wert['einheit'], EINHEIT_MAX) ||
    !istText(wert['herkunft']) ||
    !HERKUENFTE.has(wert['herkunft']) ||
    typeof wert['verfallsdatumPflicht'] !== 'boolean'
  ) {
    return null;
  }
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    sollMenge: wert['sollMenge'],
    einheit: wert['einheit'],
    herkunft: wert['herkunft'],
    verfallsdatumPflicht: wert['verfallsdatumPflicht'],
  };
}

function pruefeFach(wert: unknown): FachEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istKurztext(wert['bezeichnung'], BEZEICHNUNG_MAX) ||
    !Array.isArray(wert['artikel'])
  ) {
    return null;
  }
  const artikel = wert['artikel'].map(pruefeArtikel);
  if (artikel.some((a) => a === null)) return null;
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    artikel: artikel as ArtikelEingabe[],
  };
}

/**
 * Prüft den gesamten Vorlagenbaum. Doppelte Artikel- oder Fach-Ids werden
 * abgewiesen: ein Check bezieht seine Positionen über die Artikel-Id, eine
 * Dopplung machte die Zuordnung mehrdeutig.
 */
export function pruefeVorlageEingabe(wert: unknown): VorlageEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istKurztext(wert['bezeichnung'], BEZEICHNUNG_MAX) ||
    !istKurztext(wert['beschreibung'], TEXT_MAX) ||
    !istKurztext(wert['grundlage'], TEXT_MAX) ||
    !Array.isArray(wert['faecher'])
  ) {
    return null;
  }
  const faecher = wert['faecher'].map(pruefeFach);
  if (faecher.some((f) => f === null)) return null;
  const gepruefteFaecher = faecher as FachEingabe[];

  const ids = new Set<string>();
  for (const fach of gepruefteFaecher) {
    if (ids.has(fach.id)) return null;
    ids.add(fach.id);
    for (const artikel of fach.artikel) {
      if (ids.has(artikel.id)) return null;
      ids.add(artikel.id);
    }
  }

  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    beschreibung: wert['beschreibung'],
    grundlage: wert['grundlage'],
    faecher: gepruefteFaecher,
  };
}

interface VorlageZeile {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  grundlage: string;
  inhalt: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuVorlageJson(zeile: VorlageZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    beschreibung: zeile.beschreibung,
    grundlage: zeile.grundlage,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    faecher: JSON.parse(zeile.inhalt),
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

/**
 * Die Liste führt bewusst nur die Kopfdaten und zwei Kennzahlen: der Baum einer
 * einzelnen Vorlage ist gut 20 kB groß, und die Übersicht zeigt ihn nie. Wer
 * ihn braucht, lädt die Vorlage einzeln – dann auch mit ETag für ein späteres
 * `If-Match`.
 */
async function listeVorlagen(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM pruefvorlagen ORDER BY bezeichnung')
    .all<VorlageZeile>();
  const vorlagen = ergebnis.results.map((zeile) => {
    const faecher: { artikel: unknown[] }[] = JSON.parse(zeile.inhalt);
    return {
      id: zeile.id,
      bezeichnung: zeile.bezeichnung,
      beschreibung: zeile.beschreibung,
      grundlage: zeile.grundlage,
      anzahlFaecher: faecher.length,
      anzahlArtikel: faecher.reduce((summe, fach) => summe + fach.artikel.length, 0),
      geaendertAm: zeile.geaendert_am,
      geaendertVon: zeile.geaendert_von,
    };
  });
  return jsonAntwort({ vorlagen });
}

async function leseVorlage(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM pruefvorlagen WHERE id = ?')
    .bind(id)
    .first<VorlageZeile>();
  if (!zeile) {
    return fehlerAntwort('MATERIAL_VORLAGE_NICHT_GEFUNDEN', 'Prüfvorlage nicht gefunden.', 404);
  }
  return jsonAntwort(zuVorlageJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

function vorlageAntwort(
  eingabe: VorlageEingabe,
  jetzt: string,
  email: string,
  status: number,
  version: number,
): Response {
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      beschreibung: eingabe.beschreibung,
      grundlage: eingabe.grundlage,
      faecher: eingabe.faecher,
      geaendertAm: jetzt,
      geaendertVon: email,
    },
    status,
    { ETag: starkesEtag(version) },
  );
}

async function legeVorlageAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'MATERIAL_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, VORLAGE_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeVorlageEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültige Prüfvorlage.', 400);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO pruefvorlagen
           (id, bezeichnung, beschreibung, grundlage, inhalt, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.beschreibung,
        eingabe.grundlage,
        JSON.stringify(eingabe.faecher),
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return fehlerAntwort(
      'MATERIAL_VERSIONSKONFLIKT',
      'Eine Prüfvorlage mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return vorlageAntwort(eingabe, jetzt, identitaet.email, 201, 1);
}

async function aktualisiereVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const erwartet = erwarteteVersion(anfrage);
  if (erwartet instanceof Response) return erwartet;
  const koerper = await lesePruefeKoerper(anfrage, VORLAGE_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeVorlageEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültige Prüfvorlage.', 400);
  }
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE pruefvorlagen
       SET bezeichnung = ?, beschreibung = ?, grundlage = ?, inhalt = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.bezeichnung,
      eingabe.beschreibung,
      eingabe.grundlage,
      JSON.stringify(eingabe.faecher),
      jetzt,
      identitaet.email,
      id,
      erwartet,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'MATERIAL_VERSIONSKONFLIKT',
      'Die Prüfvorlage wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return vorlageAntwort(eingabe, jetzt, identitaet.email, 200, erwartet + 1);
}

/**
 * Löschen ist gesperrt, solange ein Behälter auf die Vorlage verweist. Ein
 * Fremdschlüsselfehler allein genügt hier nicht als Schutz: er käme ohne
 * eigenen Code beim Aufrufer als allgemeiner Datenbankfehler an.
 */
async function loescheVorlage(db: D1Database, id: string): Promise<Response> {
  const verweis = await db
    .prepare('SELECT 1 AS treffer FROM behaelter WHERE vorlage_id = ? LIMIT 1')
    .bind(id)
    .first<{ treffer: number }>();
  if (verweis) {
    return fehlerAntwort(
      'MATERIAL_VORLAGE_IN_BENUTZUNG',
      'Die Prüfvorlage wird noch von mindestens einem Behälter verwendet.',
      409,
    );
  }
  const ergebnis = await db.prepare('DELETE FROM pruefvorlagen WHERE id = ?').bind(id).run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('MATERIAL_VORLAGE_NICHT_GEFUNDEN', 'Prüfvorlage nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}

/* -------------------------------------------------------------------- */
/* Behälter                                                              */
/* -------------------------------------------------------------------- */

interface BehaelterEingabe {
  id: string;
  fahrzeugId: string;
  vorlageId: string;
  bezeichnung: string;
  bemerkung: string;
}

export function pruefeBehaelterEingabe(wert: unknown): BehaelterEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['fahrzeugId']) ||
    !UUID_REGEX.test(wert['fahrzeugId']) ||
    !istNichtleererText(wert['vorlageId']) ||
    !UUID_REGEX.test(wert['vorlageId']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istKurztext(wert['bezeichnung'], BEZEICHNUNG_MAX) ||
    !istKurztext(wert['bemerkung'], TEXT_MAX)
  ) {
    return null;
  }
  return {
    id: wert['id'],
    fahrzeugId: wert['fahrzeugId'],
    vorlageId: wert['vorlageId'],
    bezeichnung: wert['bezeichnung'],
    bemerkung: wert['bemerkung'],
  };
}

interface BehaelterZeile {
  id: string;
  fahrzeug_id: string;
  vorlage_id: string;
  bezeichnung: string;
  bemerkung: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

/**
 * `check_token` und `check_token_am` fehlen hier absichtlich, obwohl `SELECT *`
 * sie mitliest: das Token ist ein Geheimnis und verlässt den Worker allein über
 * die Prüfcode-Endpunkte. Ein Test hält das fest.
 */
function zuBehaelterJson(zeile: BehaelterZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    fahrzeugId: zeile.fahrzeug_id,
    vorlageId: zeile.vorlage_id,
    bezeichnung: zeile.bezeichnung,
    bemerkung: zeile.bemerkung,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

interface BehaelterUebersichtZeile extends BehaelterZeile {
  fahrzeug_bezeichnung: string;
  fahrzeug_funkrufname: string;
  fahrzeug_gruppe: string;
  vorlage_bezeichnung: string;
  zuletzt_geprueft_am: string | null;
  letzter_check_id: string | null;
  letzte_fehlmengen: number | null;
  letzte_unbrauchbar: number | null;
  letzte_abgelaufen: number | null;
}

/**
 * Ein Aufruf über den ganzen Bestand statt eines Abrufs je Behälter: Fahrzeug,
 * Vorlage und der jeweils letzte Check kommen als ein Verbund. Die Teilabfrage
 * wählt je Behälter den jüngsten Check über `geprueft_am`, bei Gleichstand über
 * `erfasst_am` – SQLite liefert bei `max()` in einer gruppierten Auswahl die
 * Werte genau dieser Zeile.
 */
const BEHAELTER_UEBERSICHT = `
  SELECT b.*, f.bezeichnung AS fahrzeug_bezeichnung, f.funkrufname AS fahrzeug_funkrufname,
         f.gruppe AS fahrzeug_gruppe, v.bezeichnung AS vorlage_bezeichnung,
         c.geprueft_am AS zuletzt_geprueft_am, c.id AS letzter_check_id,
         c.fehlmengen AS letzte_fehlmengen, c.unbrauchbar AS letzte_unbrauchbar,
         c.abgelaufen AS letzte_abgelaufen
  FROM behaelter b
  JOIN fahrzeuge f ON f.id = b.fahrzeug_id
  JOIN pruefvorlagen v ON v.id = b.vorlage_id
  LEFT JOIN (
    SELECT behaelter_id, id, geprueft_am, fehlmengen, unbrauchbar, abgelaufen,
           max(geprueft_am || 'T' || erfasst_am) AS neueste
    FROM materialchecks GROUP BY behaelter_id
  ) c ON c.behaelter_id = b.id
  ORDER BY f.bezeichnung, b.bezeichnung`;

async function listeBehaelter(db: D1Database): Promise<Response> {
  const ergebnis = await db.prepare(BEHAELTER_UEBERSICHT).all<BehaelterUebersichtZeile>();
  const behaelter = ergebnis.results.map((zeile) => ({
    ...zuBehaelterJson(zeile),
    fahrzeugBezeichnung: zeile.fahrzeug_bezeichnung,
    fahrzeugFunkrufname: zeile.fahrzeug_funkrufname,
    fahrzeugGruppe: zeile.fahrzeug_gruppe,
    vorlageBezeichnung: zeile.vorlage_bezeichnung,
    zuletztGeprueftAm: zeile.zuletzt_geprueft_am,
    letzterCheckId: zeile.letzter_check_id,
    letzteFehlmengen: zeile.letzte_fehlmengen,
    letzteUnbrauchbar: zeile.letzte_unbrauchbar,
    letzteAbgelaufen: zeile.letzte_abgelaufen,
  }));
  return jsonAntwort({ behaelter });
}

async function leseBehaelter(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM behaelter WHERE id = ?')
    .bind(id)
    .first<BehaelterZeile>();
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  return jsonAntwort(zuBehaelterJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

/**
 * Fahrzeug und Vorlage müssen existieren. Geprüft wird vorab mit eigenen
 * Fehlercodes, damit der Aufrufer den Unterschied sieht; der Fremdschlüssel
 * bleibt als Rückfallebene bestehen.
 */
async function pruefeVerweise(db: D1Database, eingabe: BehaelterEingabe): Promise<Response | null> {
  const fahrzeug = await db
    .prepare('SELECT 1 AS treffer FROM fahrzeuge WHERE id = ?')
    .bind(eingabe.fahrzeugId)
    .first<{ treffer: number }>();
  if (!fahrzeug) {
    return fehlerAntwort(
      'MATERIAL_FAHRZEUG_UNBEKANNT',
      'Das angegebene Fahrzeug existiert nicht.',
      409,
    );
  }
  const vorlage = await db
    .prepare('SELECT 1 AS treffer FROM pruefvorlagen WHERE id = ?')
    .bind(eingabe.vorlageId)
    .first<{ treffer: number }>();
  if (!vorlage) {
    return fehlerAntwort(
      'MATERIAL_VORLAGE_NICHT_GEFUNDEN',
      'Die angegebene Prüfvorlage existiert nicht.',
      409,
    );
  }
  return null;
}

function behaelterAntwort(
  eingabe: BehaelterEingabe,
  jetzt: string,
  email: string,
  status: number,
  version: number,
): Response {
  return jsonAntwort(
    {
      id: eingabe.id,
      fahrzeugId: eingabe.fahrzeugId,
      vorlageId: eingabe.vorlageId,
      bezeichnung: eingabe.bezeichnung,
      bemerkung: eingabe.bemerkung,
      geaendertAm: jetzt,
      geaendertVon: email,
    },
    status,
    { ETag: starkesEtag(version) },
  );
}

async function legeBehaelterAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'MATERIAL_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, BEHAELTER_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeBehaelterEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültiger Behälter.', 400);
  }
  const verweisfehler = await pruefeVerweise(db, eingabe);
  if (verweisfehler) return verweisfehler;

  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO behaelter
           (id, fahrzeug_id, vorlage_id, bezeichnung, bemerkung, check_token, check_token_am,
            geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, lower(hex(randomblob(16))), ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.fahrzeugId,
        eingabe.vorlageId,
        eingabe.bezeichnung,
        eingabe.bemerkung,
        jetzt,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return fehlerAntwort(
      'MATERIAL_VERSIONSKONFLIKT',
      'Ein Behälter mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return behaelterAntwort(eingabe, jetzt, identitaet.email, 201, 1);
}

async function aktualisiereBehaelter(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const erwartet = erwarteteVersion(anfrage);
  if (erwartet instanceof Response) return erwartet;
  const koerper = await lesePruefeKoerper(anfrage, BEHAELTER_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeBehaelterEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültiger Behälter.', 400);
  }
  const verweisfehler = await pruefeVerweise(db, eingabe);
  if (verweisfehler) return verweisfehler;

  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE behaelter
       SET fahrzeug_id = ?, vorlage_id = ?, bezeichnung = ?, bemerkung = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.fahrzeugId,
      eingabe.vorlageId,
      eingabe.bezeichnung,
      eingabe.bemerkung,
      jetzt,
      identitaet.email,
      id,
      erwartet,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'MATERIAL_VERSIONSKONFLIKT',
      'Der Behälter wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return behaelterAntwort(eingabe, jetzt, identitaet.email, 200, erwartet + 1);
}

/**
 * Löschen ist gesperrt, solange ein Check auf den Behälter verweist: ein
 * durchgeführter Check ist ein Nachweis und darf nicht mit dem Behälter
 * verschwinden.
 */
async function loescheBehaelter(db: D1Database, id: string): Promise<Response> {
  const verweis = await db
    .prepare('SELECT 1 AS treffer FROM materialchecks WHERE behaelter_id = ? LIMIT 1')
    .bind(id)
    .first<{ treffer: number }>();
  if (verweis) {
    return fehlerAntwort(
      'MATERIAL_BEHAELTER_IN_BENUTZUNG',
      'Für diesen Behälter sind bereits Checks erfasst.',
      409,
    );
  }
  const ergebnis = await db.prepare('DELETE FROM behaelter WHERE id = ?').bind(id).run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}

/* -------------------------------------------------------------------- */
/* Fahrzeugcheck                                                         */
/* -------------------------------------------------------------------- */

interface CheckZeile {
  id: string;
  behaelter_id: string;
  vorlage_id: string;
  vorlage_version: number;
  vorlage_bezeichnung: string;
  grundlage: string;
  geprueft_am: string;
  erfasst_am: string;
  erfasst_von: string;
  gemeldet_von_name: string | null;
  quelle: string;
  verfallsdatum_erfasst: number;
  bemerkung: string;
  positionen: string;
  positionen_gesamt: number;
  positionen_geprueft: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
}

/** Kopfdaten ohne `positionen`: die Historie zeigt den Inhalt nie. */
function zuCheckKopfJson(zeile: CheckZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    behaelterId: zeile.behaelter_id,
    vorlageId: zeile.vorlage_id,
    vorlageBezeichnung: zeile.vorlage_bezeichnung,
    geprueftAm: zeile.geprueft_am,
    erfasstAm: zeile.erfasst_am,
    erfasstVon: zeile.erfasst_von,
    gemeldetVonName: zeile.gemeldet_von_name,
    quelle: zeile.quelle,
    verfallsdatumErfasst: zeile.verfallsdatum_erfasst === 1,
    bemerkung: zeile.bemerkung,
    positionenGesamt: zeile.positionen_gesamt,
    positionenGeprueft: zeile.positionen_geprueft,
    fehlmengen: zeile.fehlmengen,
    unbrauchbar: zeile.unbrauchbar,
    abgelaufen: zeile.abgelaufen,
  };
}

function zuCheckJson(zeile: CheckZeile): Record<string, unknown> {
  return {
    ...zuCheckKopfJson(zeile),
    grundlage: zeile.grundlage,
    vorlageVersion: zeile.vorlage_version,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    positionen: JSON.parse(zeile.positionen),
  };
}

interface BehaelterMitVorlageZeile extends BehaelterZeile {
  fahrzeug_bezeichnung: string;
  fahrzeug_funkrufname: string;
  fahrzeug_gruppe: string;
  vorlage_bezeichnung: string;
  vorlage_grundlage: string;
  vorlage_inhalt: string;
  vorlage_version: number;
}

const BEHAELTER_MIT_VORLAGE = `
  SELECT b.*, f.bezeichnung AS fahrzeug_bezeichnung, f.funkrufname AS fahrzeug_funkrufname,
         f.gruppe AS fahrzeug_gruppe, v.bezeichnung AS vorlage_bezeichnung,
         v.grundlage AS vorlage_grundlage, v.inhalt AS vorlage_inhalt,
         v.version AS vorlage_version
  FROM behaelter b
  JOIN fahrzeuge f ON f.id = b.fahrzeug_id
  JOIN pruefvorlagen v ON v.id = b.vorlage_id
  WHERE b.id = ?`;

async function ladeBehaelterMitVorlage(
  db: D1Database,
  behaelterId: string,
): Promise<BehaelterMitVorlageZeile | null> {
  return db.prepare(BEHAELTER_MIT_VORLAGE).bind(behaelterId).first<BehaelterMitVorlageZeile>();
}

/**
 * Alles, was die Prüfseite braucht, in **einem** Aufruf: Behälter, Fahrzeug und
 * die vollständige Vorlage. Zwei getrennte Abrufe wären zwei Worker-Anfragen
 * gegen das Tageskontingent, für Daten, die immer zusammen gebraucht werden.
 */
async function lesePruefauftrag(db: D1Database, behaelterId: string): Promise<Response> {
  const zeile = await ladeBehaelterMitVorlage(db, behaelterId);
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  return jsonAntwort({
    behaelter: {
      ...zuBehaelterJson(zeile),
      fahrzeugBezeichnung: zeile.fahrzeug_bezeichnung,
      fahrzeugFunkrufname: zeile.fahrzeug_funkrufname,
      fahrzeugGruppe: zeile.fahrzeug_gruppe,
    },
    vorlage: {
      id: zeile.vorlage_id,
      bezeichnung: zeile.vorlage_bezeichnung,
      grundlage: zeile.vorlage_grundlage,
      version: zeile.vorlage_version,
      faecher: JSON.parse(zeile.vorlage_inhalt),
    },
  });
}

async function listeChecks(db: D1Database, behaelterId: string): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT * FROM materialchecks WHERE behaelter_id = ?
       ORDER BY geprueft_am DESC, erfasst_am DESC`,
    )
    .bind(behaelterId)
    .all<CheckZeile>();
  return jsonAntwort({ checks: ergebnis.results.map(zuCheckKopfJson) });
}

async function leseCheck(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM materialchecks WHERE id = ?')
    .bind(id)
    .first<CheckZeile>();
  if (!zeile) {
    return fehlerAntwort('MATERIAL_CHECK_NICHT_GEFUNDEN', 'Check nicht gefunden.', 404);
  }
  return jsonAntwort(zuCheckJson(zeile));
}

const POSITIONEN_FEHLERTEXT: Readonly<Record<string, string>> = {
  unlesbar: 'Die Positionen sind nicht lesbar.',
  'unbekannter-artikel': 'Der Check enthält einen Artikel, den die Prüfvorlage nicht kennt.',
  'artikel-doppelt': 'Ein Artikel kommt im Check mehrfach vor.',
  'artikel-fehlt': 'Der Check deckt nicht alle Artikel der Prüfvorlage ab.',
  'stueckzahl-passt-nicht': 'Die Zahl der Verfallsdaten passt nicht zur Sollmenge.',
};

/**
 * Nimmt einen Check entgegen. Der Vorgang ist **ein** Schreibvorgang: alle
 * Positionen liegen als JSON in einer Zeile, die Kennzahlen daneben in eigenen
 * Spalten. Eine Zeile je Position wären gut hundert Schreibvorgänge je Prüfung
 * gegen das Tageskontingent des kostenlosen Tarifs.
 */
async function legeCheckAn(
  anfrage: Request,
  db: D1Database,
  behaelterId: string,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'MATERIAL_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const zeile = await ladeBehaelterMitVorlage(db, behaelterId);
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  const koerper = await lesePruefeKoerper(anfrage, CHECK_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const inhalt = koerper.inhalt;
  if (
    !istObjekt(inhalt) ||
    !istNichtleererText(inhalt['id']) ||
    !UUID_REGEX.test(inhalt['id']) ||
    typeof inhalt['verfallsdatumErfasst'] !== 'boolean' ||
    !istKurztext(inhalt['bemerkung'], TEXT_MAX)
  ) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültiger Check.', 400);
  }

  const faecher: VorlagenFach[] = JSON.parse(zeile.vorlage_inhalt);
  const geprueft = pruefePositionen(inhalt['positionen'], faecher);
  if ('fehler' in geprueft) {
    return fehlerAntwort(
      'MATERIAL_CHECK_POSITIONEN_UNGUELTIG',
      POSITIONEN_FEHLERTEXT[geprueft.fehler] ?? 'Ungültige Positionen.',
      400,
    );
  }

  const jetzt = new Date();
  // Berliner Kalendertag, serverseitig: die Seite hat bewusst kein Datumsfeld.
  const geprueftAm = berlinerKalendertag(jetzt);
  const kennzahlen = zaehleKennzahlen(geprueft.positionen, geprueftAm);
  if (kennzahlen.geprueft === 0) {
    return fehlerAntwort(
      'MATERIAL_CHECK_OHNE_PRUEFUNG',
      'Ein Check ohne eine einzige geprüfte Position ist kein Nachweis.',
      400,
    );
  }

  const erfasstAm = jetzt.toISOString();
  await db
    .prepare(
      `INSERT INTO materialchecks
         (id, behaelter_id, vorlage_id, vorlage_version, vorlage_bezeichnung, grundlage,
          geprueft_am, erfasst_am, erfasst_von, gemeldet_von_name, quelle,
          verfallsdatum_erfasst, bemerkung, positionen, positionen_gesamt,
          positionen_geprueft, fehlmengen, unbrauchbar, abgelaufen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'angemeldet', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      inhalt['id'],
      behaelterId,
      zeile.vorlage_id,
      zeile.vorlage_version,
      zeile.vorlage_bezeichnung,
      zeile.vorlage_grundlage,
      geprueftAm,
      erfasstAm,
      // Immer die geprüfte Identität, nie eine Angabe aus dem Anfragekörper.
      identitaet.email,
      inhalt['verfallsdatumErfasst'] ? 1 : 0,
      inhalt['bemerkung'],
      JSON.stringify(geprueft.positionen),
      kennzahlen.gesamt,
      kennzahlen.geprueft,
      kennzahlen.fehlmengen,
      kennzahlen.unbrauchbar,
      kennzahlen.abgelaufen,
    )
    .run();

  return jsonAntwort(
    {
      id: inhalt['id'],
      behaelterId,
      vorlageId: zeile.vorlage_id,
      vorlageVersion: zeile.vorlage_version,
      vorlageBezeichnung: zeile.vorlage_bezeichnung,
      grundlage: zeile.vorlage_grundlage,
      geprueftAm,
      erfasstAm,
      erfasstVon: identitaet.email,
      gemeldetVonName: null,
      quelle: 'angemeldet',
      verfallsdatumErfasst: inhalt['verfallsdatumErfasst'],
      bemerkung: inhalt['bemerkung'],
      positionen: geprueft.positionen,
      positionenGesamt: kennzahlen.gesamt,
      positionenGeprueft: kennzahlen.geprueft,
      fehlmengen: kennzahlen.fehlmengen,
      unbrauchbar: kennzahlen.unbrauchbar,
      abgelaufen: kennzahlen.abgelaufen,
    },
    201,
  );
}

/* -------------------------------------------------------------------- */
/* Gemeinsames                                                           */
/* -------------------------------------------------------------------- */

/** Erwartete Versionsnummer aus `If-Match`, sonst die abweisende Antwort. */
function erwarteteVersion(anfrage: Request): number | Response {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'MATERIAL_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const version = versionAusEtag(ifMatch);
  if (version === null) {
    return fehlerAntwort('MATERIAL_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  return version;
}

export async function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort('MATERIAL_INHALTSTYP_UNGUELTIG', 'Unzulässiger Inhaltstyp.', 415);
  }
  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 10_000);
  try {
    const ergebnis = await leseJsonBegrenzt(anfrage, grenze, abbruch.signal);
    if (!ergebnis.erfolg) {
      return ergebnis.ursache === 'zu-gross'
        ? fehlerAntwort('MATERIAL_DATEI_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
        : fehlerAntwort('MATERIAL_DATEI_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
    }
    return { inhalt: ergebnis.inhalt };
  } finally {
    clearTimeout(zeitlimit);
  }
}

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

    // Die festen Unterpfade stehen vor dem UUID-Pfad des Behälters, sonst
    // liefe `/behaelter/<UUID>/checks` in dessen Nichttreffer.
    const auftragId = PRUEFAUFTRAG_PFAD.exec(url.pathname)?.[1];
    if (auftragId) {
      if (anfrage.method === 'GET') return await lesePruefauftrag(db, auftragId);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
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
