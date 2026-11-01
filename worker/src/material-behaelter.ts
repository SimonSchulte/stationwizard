import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag } from './etag';
import { istNichtleererText, istObjekt, UUID_REGEX } from './json-lesen';
import {
  BEHAELTER_KOERPER_GRENZE,
  BEZEICHNUNG_MAX,
  erwarteteVersion,
  istKurztext,
  lesePruefeKoerper,
  TEXT_MAX,
} from './material-gemeinsam';

/** Behälter: Eingabeprüfung, Übersicht samt Fahrzeug und letztem Check, Pflege. */

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

export interface BehaelterZeile {
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
export function zuBehaelterJson(zeile: BehaelterZeile): Record<string, unknown> {
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

export async function listeBehaelter(db: D1Database): Promise<Response> {
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

export async function leseBehaelter(db: D1Database, id: string): Promise<Response> {
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

export async function legeBehaelterAn(
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

export async function aktualisiereBehaelter(
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
export async function loescheBehaelter(db: D1Database, id: string): Promise<Response> {
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
