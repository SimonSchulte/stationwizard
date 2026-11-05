import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  bereitsVorhanden,
  erwarteteVersion,
  lesePruefeKoerper,
  nichtGefunden,
  PEP_KOERPER_GRENZE,
  ungueltig,
  versionskonflikt,
} from './einsatzplanung-gemeinsam';
import { type Pep, pruefePep, zaehlePep } from './einsatzplanung-pep-pruefung';
import { starkesEtag } from './etag';

/** PEP eines Einsatzes: genau eine Zeile je Einsatz, Inhalt als geprüftes JSON. */

interface PepZeile {
  schema: number;
  vorlage_id: string | null;
  inhalt: string;
  version: number;
}

function pepNichtGefunden(): Response {
  return fehlerAntwort(
    'EINSATZPLANUNG_PEP_NICHT_GEFUNDEN',
    'Zu diesem Einsatz gibt es keine PEP.',
    404,
  );
}

export async function lesePep(db: D1Database, einsatzId: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT schema, vorlage_id, inhalt, version FROM peps WHERE einsatz_id = ?')
    .bind(einsatzId)
    .first<PepZeile>();
  if (!zeile) return pepNichtGefunden();
  const pep = {
    schema: zeile.schema,
    vorlageId: zeile.vorlage_id,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    inhalt: JSON.parse(zeile.inhalt),
  };
  return jsonAntwort(pep, 200, { ETag: starkesEtag(zeile.version) });
}

export async function schreibePep(
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
  const koerper = await lesePruefeKoerper(anfrage, PEP_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe: Pep | null = pruefePep(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültige PEP.');
  const kennzahlen = zaehlePep(eingabe.inhalt);
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
          `INSERT INTO peps
             (einsatz_id, schema, vorlage_id, inhalt, posten, positionen, besetzt, einsatzkraefte,
              version, geaendert_am, geaendert_von)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          einsatzId,
          eingabe.schema,
          eingabe.vorlageId,
          inhaltJson,
          kennzahlen.posten,
          kennzahlen.positionen,
          kennzahlen.besetzt,
          kennzahlen.einsatzkraefte,
          jetzt,
          identitaet.email,
        )
        .run();
    } catch (ursache) {
      if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
        return bereitsVorhanden('Zu diesem Einsatz gibt es bereits eine PEP.');
      }
      throw ursache;
    }
    return jsonAntwort(eingabe, 201, { ETag: starkesEtag(1) });
  }

  const ergebnis = await db
    .prepare(
      `UPDATE peps
       SET schema = ?, vorlage_id = ?, inhalt = ?, posten = ?, positionen = ?, besetzt = ?,
           einsatzkraefte = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE einsatz_id = ? AND version = ?`,
    )
    .bind(
      eingabe.schema,
      eingabe.vorlageId,
      inhaltJson,
      kennzahlen.posten,
      kennzahlen.positionen,
      kennzahlen.besetzt,
      kennzahlen.einsatzkraefte,
      jetzt,
      identitaet.email,
      einsatzId,
      version,
    )
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, einsatzId);
  return jsonAntwort(eingabe, 200, { ETag: starkesEtag(version + 1) });
}

export async function loeschePep(
  anfrage: Request,
  db: D1Database,
  einsatzId: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const ergebnis = await db
    .prepare('DELETE FROM peps WHERE einsatz_id = ? AND version = ?')
    .bind(einsatzId, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, einsatzId);
  return new Response(null, { status: 204 });
}

/** Kein Treffer bei Version und Einsatz: unbekannt (404) oder veraltet (412)? */
async function ablehnungOhneTreffer(db: D1Database, einsatzId: string): Promise<Response> {
  const pep = await db
    .prepare('SELECT einsatz_id FROM peps WHERE einsatz_id = ?')
    .bind(einsatzId)
    .first<{ einsatz_id: string }>();
  if (pep) return versionskonflikt('Die PEP wurde zwischenzeitlich geändert. Bitte neu laden.');
  const einsatz = await db
    .prepare('SELECT id FROM einsaetze WHERE id = ?')
    .bind(einsatzId)
    .first<{ id: string }>();
  return einsatz ? pepNichtGefunden() : nichtGefunden();
}
