import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  bereitsVorhanden,
  erwarteteVersion,
  lesePruefeKoerper,
  pruefeAnlegenVorbedingung,
  ungueltig,
  VB_KOERPER_GRENZE,
  versionskonflikt,
} from './einsatzplanung-gemeinsam';
import { pruefeVbVorlage, zaehleVb, type VbVorlage } from './einsatzplanung-pruefung';
import { starkesEtag } from './etag';

/** VB-Vorlagen: Liste als Kopfdaten mit Kennzahlen, Einzelabruf, Anlage, Änderung, Löschen. */

interface VorlageZeile {
  id: string;
  titel: string;
  inhalt: string;
  version: number;
}

interface VorlagenListenZeile {
  id: string;
  titel: string;
  version: number;
  abschnitte: number;
  laufzettel: number;
  positionen: number;
  geaendert_am: string;
}

function vorlageNichtGefunden(): Response {
  return fehlerAntwort('EINSATZPLANUNG_VORLAGE_NICHT_GEFUNDEN', 'VB-Vorlage nicht gefunden.', 404);
}

export async function listeVorlagen(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT id, titel, version, abschnitte, laufzettel, positionen, geaendert_am
       FROM vb_vorlagen ORDER BY titel`,
    )
    .all<VorlagenListenZeile>();
  return jsonAntwort({
    vorlagen: ergebnis.results.map((zeile) => ({
      id: zeile.id,
      titel: zeile.titel,
      version: zeile.version,
      abschnitte: zeile.abschnitte,
      laufzettel: zeile.laufzettel,
      positionen: zeile.positionen,
      geaendertAm: zeile.geaendert_am,
    })),
  });
}

export async function leseVorlage(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT id, titel, inhalt, version FROM vb_vorlagen WHERE id = ?')
    .bind(id)
    .first<VorlageZeile>();
  if (!zeile) return vorlageNichtGefunden();
  const vorlage: VbVorlage = {
    id: zeile.id,
    titel: zeile.titel,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    inhalt: JSON.parse(zeile.inhalt),
  };
  return jsonAntwort(vorlage, 200, { ETag: starkesEtag(zeile.version) });
}

export async function legeVorlageAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = pruefeAnlegenVorbedingung(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, VB_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeVbVorlage(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültige VB-Vorlage.');
  const kennzahlen = zaehleVb(eingabe.inhalt);
  try {
    await db
      .prepare(
        `INSERT INTO vb_vorlagen
           (id, titel, inhalt, abschnitte, laufzettel, positionen, version, geaendert_am,
            geaendert_von)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.titel,
        JSON.stringify(eingabe.inhalt),
        kennzahlen.abschnitte,
        kennzahlen.laufzettel,
        kennzahlen.positionen,
        new Date().toISOString(),
        identitaet.email,
      )
      .run();
  } catch (ursache) {
    if (ursache instanceof Error && ursache.message.includes('UNIQUE')) {
      return bereitsVorhanden('Eine VB-Vorlage mit dieser Kennung existiert bereits.');
    }
    throw ursache;
  }
  return jsonAntwort(eingabe, 201, { ETag: starkesEtag(1) });
}

export async function aktualisiereVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, VB_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeVbVorlage(koerper.inhalt);
  if (!eingabe || eingabe.id.toLowerCase() !== id.toLowerCase()) {
    return ungueltig('Ungültige VB-Vorlage.');
  }
  const kennzahlen = zaehleVb(eingabe.inhalt);
  const ergebnis = await db
    .prepare(
      `UPDATE vb_vorlagen
       SET titel = ?, inhalt = ?, abschnitte = ?, laufzettel = ?, positionen = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.titel,
      JSON.stringify(eingabe.inhalt),
      kennzahlen.abschnitte,
      kennzahlen.laufzettel,
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

export async function loescheVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const ergebnis = await db
    .prepare('DELETE FROM vb_vorlagen WHERE id = ? AND version = ?')
    .bind(id, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return new Response(null, { status: 204 });
}

async function ablehnungOhneTreffer(db: D1Database, id: string): Promise<Response> {
  const vorhanden = await db
    .prepare('SELECT id FROM vb_vorlagen WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  return vorhanden
    ? versionskonflikt('Die VB-Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.')
    : vorlageNichtGefunden();
}
