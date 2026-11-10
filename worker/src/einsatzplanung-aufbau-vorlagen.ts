import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  bereitsVorhanden,
  erwarteteVersion,
  lesePruefeKoerper,
  pruefeAnlegenVorbedingung,
  ungueltig,
  versionskonflikt,
} from './einsatzplanung-gemeinsam';
import {
  AUFBAU_KOERPER_GRENZE,
  pruefeAufbauVorlage,
  zaehleAufbau,
  type AufbauVorlage,
} from './einsatzplanung-aufbau-pruefung';
import { pruefeAufbauVerweise } from './einsatzplanung-aufbau-verweise';
import { starkesEtag } from './etag';

/** Aufbau-Vorlagen: Liste als Kopfdaten mit Kennzahlen, Einzelabruf, Anlage, Änderung, Löschen. */

interface AufbauVorlageZeile {
  id: string;
  titel: string;
  inhalt: string;
  version: number;
}

interface AufbauVorlagenListenZeile {
  id: string;
  titel: string;
  version: number;
  einheiten: number;
  kisten: number;
  positionen: number;
  geaendert_am: string;
}

function vorlageNichtGefunden(): Response {
  return fehlerAntwort(
    'EINSATZPLANUNG_AUFBAU_VORLAGE_NICHT_GEFUNDEN',
    'Aufbau-Vorlage nicht gefunden.',
    404,
  );
}

export async function listeAufbauVorlagen(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT id, titel, version, einheiten, kisten, positionen, geaendert_am
       FROM aufbau_vorlagen ORDER BY titel`,
    )
    .all<AufbauVorlagenListenZeile>();
  return jsonAntwort({
    vorlagen: ergebnis.results.map((zeile) => ({
      id: zeile.id,
      titel: zeile.titel,
      version: zeile.version,
      einheiten: zeile.einheiten,
      kisten: zeile.kisten,
      positionen: zeile.positionen,
      geaendertAm: zeile.geaendert_am,
    })),
  });
}

export async function leseAufbauVorlage(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT id, titel, inhalt, version FROM aufbau_vorlagen WHERE id = ?')
    .bind(id)
    .first<AufbauVorlageZeile>();
  if (!zeile) return vorlageNichtGefunden();
  const vorlage: AufbauVorlage = {
    id: zeile.id,
    titel: zeile.titel,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    inhalt: JSON.parse(zeile.inhalt),
  };
  return jsonAntwort(vorlage, 200, { ETag: starkesEtag(zeile.version) });
}

export async function legeAufbauVorlageAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = pruefeAnlegenVorbedingung(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, AUFBAU_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAufbauVorlage(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültige Aufbau-Vorlage.');
  const verweise = await pruefeAufbauVerweise(db, eingabe.inhalt);
  if (verweise) return verweise;
  const kennzahlen = zaehleAufbau(eingabe.inhalt);
  try {
    await db
      .prepare(
        `INSERT INTO aufbau_vorlagen
           (id, titel, inhalt, einheiten, kisten, positionen, version, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.titel,
        JSON.stringify(eingabe.inhalt),
        kennzahlen.einheiten,
        kennzahlen.kisten,
        kennzahlen.positionen,
        new Date().toISOString(),
        identitaet.email,
      )
      .run();
  } catch (ursache) {
    if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
      return bereitsVorhanden('Eine Aufbau-Vorlage mit dieser Kennung existiert bereits.');
    }
    throw ursache;
  }
  return jsonAntwort(eingabe, 201, { ETag: starkesEtag(1) });
}

export async function aktualisiereAufbauVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, AUFBAU_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeAufbauVorlage(koerper.inhalt);
  if (!eingabe || eingabe.id.toLowerCase() !== id.toLowerCase()) {
    return ungueltig('Ungültige Aufbau-Vorlage.');
  }
  const verweise = await pruefeAufbauVerweise(db, eingabe.inhalt);
  if (verweise) return verweise;
  const kennzahlen = zaehleAufbau(eingabe.inhalt);
  const ergebnis = await db
    .prepare(
      `UPDATE aufbau_vorlagen
       SET titel = ?, inhalt = ?, einheiten = ?, kisten = ?, positionen = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.titel,
      JSON.stringify(eingabe.inhalt),
      kennzahlen.einheiten,
      kennzahlen.kisten,
      kennzahlen.positionen,
      new Date().toISOString(),
      identitaet.email,
      id,
      version,
    )
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return jsonAntwort(eingabe, 200, { ETag: starkesEtag(version + 1) });
}

export async function loescheAufbauVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const ergebnis = await db
    .prepare('DELETE FROM aufbau_vorlagen WHERE id = ? AND version = ?')
    .bind(id, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return new Response(null, { status: 204 });
}

async function ablehnungOhneTreffer(db: D1Database, id: string): Promise<Response> {
  const vorhanden = await db
    .prepare('SELECT id FROM aufbau_vorlagen WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  return vorhanden
    ? versionskonflikt('Die Aufbau-Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.')
    : vorlageNichtGefunden();
}
