import { fehlerAntwort, jsonAntwort } from './antwort';
import { erzeugeErfassungToken } from './erfassung-token';
import { starkesEtag, versionAusEtag } from './etag';
import {
  FAHRZEUG_KOERPER_GRENZE,
  type GeprueftesBenutzerkonto,
  lesePruefeKoerper,
} from './fahrzeuge-gemeinsam';
import { diffFahrzeug, protokolliereAenderung } from './fahrzeuge-protokoll';
import { pruefeFahrzeugEingabe } from './fahrzeuge-pruefung';
import { type FahrzeugZeile, zuFahrzeugJson } from './fahrzeuge-zeilen';

/** Fahrzeugliste, Einzelabruf, Anlage und Änderung samt Kennzeichen-Eindeutigkeit. */

export async function listeFahrzeuge(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM fahrzeuge ORDER BY bezeichnung')
    .all<FahrzeugZeile>();
  return jsonAntwort({ fahrzeuge: ergebnis.results.map(zuFahrzeugJson) });
}

export async function leseFahrzeug(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM fahrzeuge WHERE id = ?')
    .bind(id)
    .first<FahrzeugZeile>();
  if (!zeile) {
    return fehlerAntwort('FAHRZEUG_NICHT_GEFUNDEN', 'Fahrzeug nicht gefunden.', 404);
  }
  return jsonAntwort(zuFahrzeugJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
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

export async function legeFahrzeugAn(
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
            gruppe, bemerkung, wartungstermine, geaendert_am, geaendert_von, version,
            erfassung_token, erfassung_token_am)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.funkrufname,
        eingabe.kennzeichen,
        eingabe.fahrgestellnummer,
        eingabe.eigentuemer,
        eingabe.gruppe,
        eingabe.bemerkung,
        JSON.stringify(eingabe.wartungstermine),
        jetzt,
        identitaet.email,
        // Sofort vergeben, damit ein neues Fahrzeug ohne Zwischenschritt
        // bedruckbar ist – genau wie der Bestand aus Migration 0007.
        erzeugeErfassungToken(),
        jetzt,
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

export async function aktualisiereFahrzeug(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'FAHRZEUGE_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const erwarteteVersion = versionAusEtag(ifMatch);
  if (erwarteteVersion === null) {
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
             eigentuemer = ?, gruppe = ?, bemerkung = ?, wartungstermine = ?, geaendert_am = ?,
             geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(
        eingabe.bezeichnung,
        eingabe.funkrufname,
        eingabe.kennzeichen,
        eingabe.fahrgestellnummer,
        eingabe.eigentuemer,
        eingabe.gruppe,
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
