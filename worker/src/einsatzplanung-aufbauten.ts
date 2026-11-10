import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { pruefeAufbau, zaehleAufbau, type Aufbau } from './einsatzplanung-aufbau-pruefung';
import { AUFBAU_KOERPER_GRENZE } from './einsatzplanung-aufbau-pruefung';
import { pruefeAufbauVerweise } from './einsatzplanung-aufbau-verweise';
import {
  bereitsVorhanden,
  erwarteteVersion,
  lesePruefeKoerper,
  nichtGefunden,
  ungueltig,
  versionskonflikt,
} from './einsatzplanung-gemeinsam';
import { starkesEtag } from './etag';

/** Aufbau eines Einsatzes: genau eine Zeile je Einsatz, Inhalt als geprüftes JSON. */

interface AufbauZeile {
  vorlage_id: string | null;
  vorlage_version: number | null;
  inhalt: string;
  version: number;
}

function aufbauNichtGefunden(): Response {
  return fehlerAntwort(
    'EINSATZPLANUNG_AUFBAU_NICHT_GEFUNDEN',
    'Zu diesem Einsatz gibt es keinen Aufbau.',
    404,
  );
}

export async function leseAufbau(db: D1Database, einsatzId: string): Promise<Response> {
  const zeile = await db
    .prepare(
      'SELECT vorlage_id, vorlage_version, inhalt, version FROM aufbauten WHERE einsatz_id = ?',
    )
    .bind(einsatzId)
    .first<AufbauZeile>();
  if (!zeile) return aufbauNichtGefunden();
  const aufbau: Aufbau = {
    vorlageId: zeile.vorlage_id,
    vorlageVersion: zeile.vorlage_version,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    inhalt: JSON.parse(zeile.inhalt),
  };
  return jsonAntwort(aufbau, 200, { ETag: starkesEtag(zeile.version) });
}

export async function schreibeAufbau(
  anfrage: Request,
  db: D1Database,
  einsatzId: string,
  identitaet: Benutzer,
): Promise<Response> {
  const ifNoneMatch = anfrage.headers.get('If-None-Match');
  const anlegen = ifNoneMatch !== null;
  if (anlegen && (ifNoneMatch !== '*' || anfrage.headers.has('If-Match'))) {
    return fehlerAntwort('EINSATZPLANUNG_VORBEDINGUNG_UNGUELTIG', 'Ungültige Vorbedingung.', 400);
  }
  let version = 0;
  if (!anlegen) {
    const erwartet = erwarteteVersion(anfrage);
    if (erwartet instanceof Response) return erwartet;
    version = erwartet;
  }
  const koerper = await lesePruefeKoerper(anfrage, AUFBAU_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAufbau(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültiger Aufbau.');
  const verweise = await pruefeAufbauVerweise(db, eingabe.inhalt);
  if (verweise) return verweise;
  const kennzahlen = zaehleAufbau(eingabe.inhalt);
  const jetzt = new Date().toISOString();
  const inhaltJson = JSON.stringify(eingabe.inhalt);

  if (anlegen) {
    const einsatz = await db
      .prepare('SELECT id FROM einsaetze WHERE id = ?')
      .bind(einsatzId)
      .first<{ id: string }>();
    if (!einsatz) return nichtGefunden();
    try {
      await db
        .prepare(
          `INSERT INTO aufbauten
             (einsatz_id, vorlage_id, vorlage_version, inhalt, einheiten, kisten, positionen,
              version, geaendert_am, geaendert_von)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          einsatzId,
          eingabe.vorlageId,
          eingabe.vorlageVersion,
          inhaltJson,
          kennzahlen.einheiten,
          kennzahlen.kisten,
          kennzahlen.positionen,
          jetzt,
          identitaet.email,
        )
        .run();
    } catch (ursache) {
      if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
        return bereitsVorhanden('Zu diesem Einsatz gibt es bereits einen Aufbau.');
      }
      throw ursache;
    }
    return jsonAntwort(eingabe, 201, { ETag: starkesEtag(1) });
  }

  const ergebnis = await db
    .prepare(
      `UPDATE aufbauten
       SET vorlage_id = ?, vorlage_version = ?, inhalt = ?, einheiten = ?, kisten = ?, positionen = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE einsatz_id = ? AND version = ?`,
    )
    .bind(
      eingabe.vorlageId,
      eingabe.vorlageVersion,
      inhaltJson,
      kennzahlen.einheiten,
      kennzahlen.kisten,
      kennzahlen.positionen,
      jetzt,
      identitaet.email,
      einsatzId,
      version,
    )
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, einsatzId);
  return jsonAntwort(eingabe, 200, { ETag: starkesEtag(version + 1) });
}

export async function loescheAufbau(
  anfrage: Request,
  db: D1Database,
  einsatzId: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const ergebnis = await db
    .prepare('DELETE FROM aufbauten WHERE einsatz_id = ? AND version = ?')
    .bind(einsatzId, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, einsatzId);
  return new Response(null, { status: 204 });
}

/** Kein Treffer bei Version und Einsatz: unbekannt (404) oder veraltet (412)? */
async function ablehnungOhneTreffer(db: D1Database, einsatzId: string): Promise<Response> {
  const vorhanden = await db
    .prepare('SELECT einsatz_id FROM aufbauten WHERE einsatz_id = ?')
    .bind(einsatzId)
    .first<{ einsatz_id: string }>();
  if (vorhanden) {
    return versionskonflikt('Der Aufbau wurde zwischenzeitlich geändert. Bitte neu laden.');
  }
  const einsatz = await db
    .prepare('SELECT id FROM einsaetze WHERE id = ?')
    .bind(einsatzId)
    .first<{ id: string }>();
  return einsatz ? aufbauNichtGefunden() : nichtGefunden();
}
