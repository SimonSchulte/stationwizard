import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  EINZEL_GRENZE,
  istEchtesDatum,
  JAHR_MAXIMUM,
  JAHR_MINIMUM,
  lesePruefeKoerper,
  type PersonZeile,
  pruefeErhalten,
  pruefeStunden,
  VERLAUF_GRENZE,
  wirksameStunden,
  zuJson,
} from './ehrungen-gemeinsam';
import { starkesEtag, versionAusEtag } from './etag';
import { istObjekt } from './json-lesen';

/** Personenzeilen: Liste, Änderung mit Stundenprotokoll, Verlauf und Entfernen. */

export async function liste(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM ehrungen_personen ORDER BY nachname, vorname')
    .all<PersonZeile>();
  return jsonAntwort({ personen: ergebnis.results.map(zuJson) });
}

export async function aktualisiere(
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
  // Stand (Jahr) ist Pflicht zu jedem Nachtrag und entfällt ohne Nachtrag.
  const standRoh = istObjekt(eingabe) ? eingabe['stundenManuellStand'] : undefined;
  const standGueltig =
    typeof standRoh === 'number' &&
    Number.isInteger(standRoh) &&
    standRoh >= JAHR_MINIMUM &&
    standRoh <= JAHR_MAXIMUM;
  const stand = manuell === null ? null : standGueltig ? standRoh : undefined;
  if (
    !istObjekt(eingabe) ||
    erhalten === null ||
    (eingabe['stundenManuell'] !== null && manuell === null) ||
    stand === undefined ||
    typeof eingabe['besondereVerdienste'] !== 'boolean' ||
    !(
      eingabe['eintrittsdatum'] === null ||
      (typeof eingabe['eintrittsdatum'] === 'string' && istEchtesDatum(eingabe['eintrittsdatum']))
    )
  ) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültige Angaben.', 400);
  }
  const bestehend = await db
    .prepare(
      'SELECT version, stunden, stunden_manuell, stunden_manuell_stand FROM ehrungen_personen WHERE id = ?',
    )
    .bind(id)
    .first<{
      version: number;
      stunden: number;
      stunden_manuell: number | null;
      stunden_manuell_stand: number | null;
    }>();
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
             stunden_manuell_stand = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(
        eingabe['eintrittsdatum'],
        eingabe['besondereVerdienste'] ? 1 : 0,
        JSON.stringify(erhalten),
        manuell,
        stand,
        jetzt,
        identitaet.email,
        id,
        erwarteteVersion,
      ),
  ];
  // Protokolleintrag nur bei tatsächlicher Änderung und nur, wenn die Änderung greift
  // (die Version nach dem Update ist die Bedingung der SELECT-Zeile).
  if (
    manuell !== bestehend.stunden_manuell ||
    stand !== (bestehend.stunden_manuell_stand ?? null)
  ) {
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
        stand,
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
      stundenManuellStand: stand,
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
export function protokollAnweisung(
  db: D1Database,
  identitaet: Benutzer,
  zeitpunkt: string,
  feld: 'stunden-import' | 'stunden-manuell',
  alt: number | null,
  neu: number | null,
  personId: string,
  versionDanach: number,
  /** Stand (Jahr) des neuen Werts; nur beim manuellen Nachtrag. */
  stand: number | null = null,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO ehrungen_aenderungen (person_id, nachname, vorname, zeitpunkt, benutzer, feld, alt, neu, stand)
       SELECT id, nachname, vorname, ?, ?, ?, ?, ?, ? FROM ehrungen_personen WHERE id = ? AND version = ?`,
    )
    .bind(zeitpunkt, identitaet.email, feld, alt, neu, stand, personId, versionDanach);
}

export async function verlauf(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT zeitpunkt, benutzer, feld, alt, neu, stand FROM ehrungen_aenderungen
       WHERE person_id = ? ORDER BY id DESC LIMIT ${VERLAUF_GRENZE}`,
    )
    .bind(id)
    .all<{
      zeitpunkt: string;
      benutzer: string;
      feld: string;
      alt: number | null;
      neu: number | null;
      stand: number | null;
    }>();
  return jsonAntwort({ aenderungen: ergebnis.results });
}

export async function loesche(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db.prepare('DELETE FROM ehrungen_personen WHERE id = ?').bind(id).run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('EHRUNGEN_NICHT_GEFUNDEN', 'Eintrag nicht gefunden.', 404);
  }
  // Kein Fremdschlüssel: die Haken der Person räumt der Worker selbst weg.
  await db.prepare('DELETE FROM ehrungen_vorgaenge WHERE person_id = ?').bind(id).run();
  await db.prepare('DELETE FROM ehrungen_zustaendigkeit WHERE person_id = ?').bind(id).run();
  return new Response(null, { status: 204 });
}
