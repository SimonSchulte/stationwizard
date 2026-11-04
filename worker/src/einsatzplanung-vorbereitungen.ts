import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  bereitsVorhanden,
  erwarteteVersion,
  lesePruefeKoerper,
  nichtGefunden,
  ungueltig,
  VB_KOERPER_GRENZE,
  versionskonflikt,
} from './einsatzplanung-gemeinsam';
import { pruefeVorbereitung, zaehleVb, type Vorbereitung } from './einsatzplanung-pruefung';
import { starkesEtag } from './etag';

/** Vorbereitung (VB) eines Einsatzes: genau eine Zeile je Einsatz, Inhalt als geprüftes JSON. */

interface VorbereitungZeile {
  vorlage_id: string | null;
  vorlage_version: number | null;
  inhalt: string;
  version: number;
}

function vbNichtGefunden(): Response {
  return fehlerAntwort(
    'EINSATZPLANUNG_VB_NICHT_GEFUNDEN',
    'Zu diesem Einsatz gibt es keine Vorbereitung.',
    404,
  );
}

function zuVorbereitungJson(zeile: VorbereitungZeile): Vorbereitung {
  return {
    vorlageId: zeile.vorlage_id,
    vorlageVersion: zeile.vorlage_version,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    inhalt: JSON.parse(zeile.inhalt),
  };
}

export async function leseVorbereitung(db: D1Database, einsatzId: string): Promise<Response> {
  const zeile = await db
    .prepare(
      'SELECT vorlage_id, vorlage_version, inhalt, version FROM vorbereitungen WHERE einsatz_id = ?',
    )
    .bind(einsatzId)
    .first<VorbereitungZeile>();
  if (!zeile) return vbNichtGefunden();
  return jsonAntwort(zuVorbereitungJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

export async function schreibeVorbereitung(
  anfrage: Request,
  db: D1Database,
  einsatzId: string,
  identitaet: Benutzer,
): Promise<Response> {
  const ifNoneMatch = anfrage.headers.get('If-None-Match');
  const ifMatch = anfrage.headers.get('If-Match');
  const anlegen = ifNoneMatch !== null;
  if (anlegen && (ifNoneMatch !== '*' || ifMatch !== null)) {
    return fehlerAntwort('EINSATZPLANUNG_VORBEDINGUNG_UNGUELTIG', 'Ungültige Vorbedingung.', 400);
  }
  let version = 0;
  if (!anlegen) {
    const erwartet = erwarteteVersion(anfrage);
    if (erwartet instanceof Response) return erwartet;
    version = erwartet;
  }
  const koerper = await lesePruefeKoerper(anfrage, VB_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeVorbereitung(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültige Vorbereitung.');
  const kennzahlen = zaehleVb(eingabe.inhalt);
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
          `INSERT INTO vorbereitungen
             (einsatz_id, vorlage_id, vorlage_version, inhalt, laufzettel, positionen, version,
              geaendert_am, geaendert_von)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          einsatzId,
          eingabe.vorlageId,
          eingabe.vorlageVersion,
          inhaltJson,
          kennzahlen.laufzettel,
          kennzahlen.positionen,
          jetzt,
          identitaet.email,
        )
        .run();
    } catch (ursache) {
      if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
        return bereitsVorhanden('Zu diesem Einsatz gibt es bereits eine Vorbereitung.');
      }
      throw ursache;
    }
    return jsonAntwort(eingabe, 201, { ETag: starkesEtag(1) });
  }

  const ergebnis = await db
    .prepare(
      `UPDATE vorbereitungen
       SET vorlage_id = ?, vorlage_version = ?, inhalt = ?, laufzettel = ?, positionen = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE einsatz_id = ? AND version = ?`,
    )
    .bind(
      eingabe.vorlageId,
      eingabe.vorlageVersion,
      inhaltJson,
      kennzahlen.laufzettel,
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

export async function loescheVorbereitung(
  anfrage: Request,
  db: D1Database,
  einsatzId: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const ergebnis = await db
    .prepare('DELETE FROM vorbereitungen WHERE einsatz_id = ? AND version = ?')
    .bind(einsatzId, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, einsatzId);
  return new Response(null, { status: 204 });
}

/** Kein Treffer bei Version und Einsatz: unbekannt (404) oder veraltet (412)? */
async function ablehnungOhneTreffer(db: D1Database, einsatzId: string): Promise<Response> {
  const vb = await db
    .prepare('SELECT einsatz_id FROM vorbereitungen WHERE einsatz_id = ?')
    .bind(einsatzId)
    .first<{ einsatz_id: string }>();
  if (vb) {
    return versionskonflikt('Die Vorbereitung wurde zwischenzeitlich geändert. Bitte neu laden.');
  }
  const einsatz = await db
    .prepare('SELECT id FROM einsaetze WHERE id = ?')
    .bind(einsatzId)
    .first<{ id: string }>();
  return einsatz ? vbNichtGefunden() : nichtGefunden();
}
