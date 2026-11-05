import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  bereitsVorhanden,
  erwarteteVersion,
  lesePruefeKoerper,
  PEP_KOERPER_GRENZE,
  pruefeAnlegenVorbedingung,
  ungueltig,
  versionskonflikt,
} from './einsatzplanung-gemeinsam';
import { type PepVorlage, pruefePepVorlage, zaehlePep } from './einsatzplanung-pep-pruefung';
import { starkesEtag } from './etag';

/** PEP-Vorlagen: Liste als Kopfdaten mit Kennzahlen, Einzelabruf, Anlage, Änderung, Löschen. */

interface PepVorlageZeile {
  id: string;
  titel: string;
  inhalt: string;
  version: number;
}

interface PepVorlagenListenZeile {
  id: string;
  titel: string;
  version: number;
  posten: number;
  positionen: number;
  geaendert_am: string;
}

function vorlageNichtGefunden(): Response {
  return fehlerAntwort(
    'EINSATZPLANUNG_PEP_VORLAGE_NICHT_GEFUNDEN',
    'PEP-Vorlage nicht gefunden.',
    404,
  );
}

export async function listePepVorlagen(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT id, titel, version, posten, positionen, geaendert_am
       FROM pep_vorlagen ORDER BY titel`,
    )
    .all<PepVorlagenListenZeile>();
  return jsonAntwort({
    vorlagen: ergebnis.results.map((zeile) => ({
      id: zeile.id,
      titel: zeile.titel,
      version: zeile.version,
      posten: zeile.posten,
      positionen: zeile.positionen,
      geaendertAm: zeile.geaendert_am,
    })),
  });
}

export async function lesePepVorlage(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT id, titel, inhalt, version FROM pep_vorlagen WHERE id = ?')
    .bind(id)
    .first<PepVorlageZeile>();
  if (!zeile) return vorlageNichtGefunden();
  const vorlage: PepVorlage = {
    id: zeile.id,
    titel: zeile.titel,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    inhalt: JSON.parse(zeile.inhalt),
  };
  return jsonAntwort(vorlage, 200, { ETag: starkesEtag(zeile.version) });
}

export async function legePepVorlageAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = pruefeAnlegenVorbedingung(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, PEP_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefePepVorlage(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültige PEP-Vorlage.');
  const kennzahlen = zaehlePep(eingabe.inhalt);
  try {
    await db
      .prepare(
        `INSERT INTO pep_vorlagen
           (id, titel, inhalt, posten, positionen, version, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.titel,
        JSON.stringify(eingabe.inhalt),
        kennzahlen.posten,
        kennzahlen.positionen,
        new Date().toISOString(),
        identitaet.email,
      )
      .run();
  } catch (ursache) {
    if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
      return bereitsVorhanden('Eine PEP-Vorlage mit dieser Kennung existiert bereits.');
    }
    throw ursache;
  }
  return jsonAntwort(eingabe, 201, { ETag: starkesEtag(1) });
}

export async function aktualisierePepVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, PEP_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefePepVorlage(koerper.inhalt);
  if (!eingabe || eingabe.id.toLowerCase() !== id.toLowerCase()) {
    return ungueltig('Ungültige PEP-Vorlage.');
  }
  const kennzahlen = zaehlePep(eingabe.inhalt);
  const ergebnis = await db
    .prepare(
      `UPDATE pep_vorlagen
       SET titel = ?, inhalt = ?, posten = ?, positionen = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.titel,
      JSON.stringify(eingabe.inhalt),
      kennzahlen.posten,
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

export async function loeschePepVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const ergebnis = await db
    .prepare('DELETE FROM pep_vorlagen WHERE id = ? AND version = ?')
    .bind(id, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return new Response(null, { status: 204 });
}

async function ablehnungOhneTreffer(db: D1Database, id: string): Promise<Response> {
  const vorhanden = await db
    .prepare('SELECT id FROM pep_vorlagen WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  return vorhanden
    ? versionskonflikt('Die PEP-Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.')
    : vorlageNichtGefunden();
}
