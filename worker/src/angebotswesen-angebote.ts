import { pruefeAngebotEingabe } from './angebotswesen-angebot-pruefung';
import { ANGEBOT_KOERPER_GRENZE, lesePruefeKoerper } from './angebotswesen-gemeinsam';
import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag, versionAusEtag } from './etag';

/** Angebote: Liste, Einzelabruf, Anlage, Änderung mit `If-Match`, Löschen. */

interface AngebotZeile {
  id: string;
  bezeichnung: string;
  auftraggeber: string;
  bemerkung: string;
  schichten: string;
  materialpauschale_aktiv: number;
  materialpauschale_cent: number | null;
  pauschalpreis_aktiv: number;
  pauschalpreis_cent: number | null;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuAngebotJson(zeile: AngebotZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    auftraggeber: zeile.auftraggeber,
    bemerkung: zeile.bemerkung,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    schichten: JSON.parse(zeile.schichten),
    materialpauschaleAktiv: zeile.materialpauschale_aktiv === 1,
    materialpauschaleCent: zeile.materialpauschale_cent,
    pauschalpreisAktiv: zeile.pauschalpreis_aktiv === 1,
    pauschalpreisCent: zeile.pauschalpreis_cent,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

export async function listeAngebote(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM angebote ORDER BY bezeichnung')
    .all<AngebotZeile>();
  return jsonAntwort({ angebote: ergebnis.results.map(zuAngebotJson) });
}

export async function leseAngebot(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM angebote WHERE id = ?')
    .bind(id)
    .first<AngebotZeile>();
  if (!zeile) {
    return fehlerAntwort('ANGEBOT_NICHT_GEFUNDEN', 'Angebot nicht gefunden.', 404);
  }
  return jsonAntwort(zuAngebotJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

export async function legeAngebotAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, ANGEBOT_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAngebotEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiges Angebot.', 400);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO angebote
           (id, bezeichnung, auftraggeber, bemerkung, schichten, materialpauschale_aktiv,
            materialpauschale_cent, pauschalpreis_aktiv, pauschalpreis_cent, geaendert_am,
            geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.auftraggeber,
        eingabe.bemerkung,
        JSON.stringify(eingabe.schichten),
        eingabe.materialpauschaleAktiv ? 1 : 0,
        eingabe.materialpauschaleCent,
        eingabe.pauschalpreisAktiv ? 1 : 0,
        eingabe.pauschalpreisCent,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return fehlerAntwort(
      'ANGEBOT_KONFLIKT',
      'Ein Angebot mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      auftraggeber: eingabe.auftraggeber,
      bemerkung: eingabe.bemerkung,
      schichten: eingabe.schichten,
      materialpauschaleAktiv: eingabe.materialpauschaleAktiv,
      materialpauschaleCent: eingabe.materialpauschaleCent,
      pauschalpreisAktiv: eingabe.pauschalpreisAktiv,
      pauschalpreisCent: eingabe.pauschalpreisCent,
      geaendertAm: jetzt,
      geaendertVon: identitaet.email,
    },
    201,
    { ETag: starkesEtag(1) },
  );
}

export async function aktualisiereAngebot(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const erwarteteVersion = versionAusEtag(ifMatch);
  if (erwarteteVersion === null) {
    return fehlerAntwort('ANGEBOTSWESEN_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  const koerper = await lesePruefeKoerper(anfrage, ANGEBOT_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAngebotEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiges Angebot.', 400);
  }
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE angebote
       SET bezeichnung = ?, auftraggeber = ?, bemerkung = ?, schichten = ?,
           materialpauschale_aktiv = ?, materialpauschale_cent = ?, pauschalpreis_aktiv = ?,
           pauschalpreis_cent = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.bezeichnung,
      eingabe.auftraggeber,
      eingabe.bemerkung,
      JSON.stringify(eingabe.schichten),
      eingabe.materialpauschaleAktiv ? 1 : 0,
      eingabe.materialpauschaleCent,
      eingabe.pauschalpreisAktiv ? 1 : 0,
      eingabe.pauschalpreisCent,
      jetzt,
      identitaet.email,
      id,
      erwarteteVersion,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'ANGEBOT_KONFLIKT',
      'Das Angebot wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      auftraggeber: eingabe.auftraggeber,
      bemerkung: eingabe.bemerkung,
      schichten: eingabe.schichten,
      materialpauschaleAktiv: eingabe.materialpauschaleAktiv,
      materialpauschaleCent: eingabe.materialpauschaleCent,
      pauschalpreisAktiv: eingabe.pauschalpreisAktiv,
      pauschalpreisCent: eingabe.pauschalpreisCent,
      geaendertAm: jetzt,
      geaendertVon: identitaet.email,
    },
    200,
    { ETag: starkesEtag(erwarteteVersion + 1) },
  );
}

export async function loescheAngebot(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db.prepare('DELETE FROM angebote WHERE id = ?').bind(id).run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('ANGEBOT_NICHT_GEFUNDEN', 'Angebot nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}
