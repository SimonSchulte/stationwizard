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
  istFremdschluesselFehler,
  istKennungsKollision,
  istNamensKollision,
  MAX_ARTIKEL,
  namenVergleich,
  pruefeArtikelEingabe,
  STAMMDATEN_KOERPER_GRENZE,
  stammdatenGrenze,
  stammdatenInNutzung,
  stammdatenNameVergeben,
} from './einsatzplanung-stammdaten';
import { aufbauVerweistAuf } from './einsatzplanung-aufbau-verweise';
import { starkesEtag } from './etag';

/**
 * Artikelkatalog: Name, feste Einheit und Heimatlager. Die ganze Liste kommt in einem Aufruf;
 * Version je Zeile, Anlage mit `If-None-Match: *`, Änderung und Löschen mit `If-Match`.
 */

interface ArtikelZeile {
  id: string;
  name: string;
  einheit: string;
  lager_id: string | null;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

function artikelJson(zeile: ArtikelZeile) {
  return {
    id: zeile.id,
    name: zeile.name,
    einheit: zeile.einheit,
    lagerId: zeile.lager_id,
    version: zeile.version,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

function artikelNichtGefunden(): Response {
  return fehlerAntwort('EINSATZPLANUNG_ARTIKEL_NICHT_GEFUNDEN', 'Artikel nicht gefunden.', 404);
}

function lagerUnbekannt(): Response {
  return ungueltig('Das Heimatlager gibt es nicht.');
}

async function lagerExistiert(db: D1Database, lagerId: string | null): Promise<boolean> {
  if (lagerId === null) return true;
  const treffer = await db
    .prepare('SELECT id FROM lager WHERE id = ?')
    .bind(lagerId)
    .first<{ id: string }>();
  return treffer !== null;
}

export async function listeArtikel(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT id, name, einheit, lager_id, version, geaendert_am, geaendert_von
       FROM artikel ORDER BY name`,
    )
    .all<ArtikelZeile>();
  return jsonAntwort({ artikel: ergebnis.results.map(artikelJson) });
}

export async function legeArtikelAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = pruefeAnlegenVorbedingung(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, STAMMDATEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeArtikelEingabe(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültiger Artikel.');
  if (!(await lagerExistiert(db, eingabe.lagerId))) return lagerUnbekannt();
  const bestand = await db.prepare('SELECT COUNT(*) AS n FROM artikel').first<{ n: number }>();
  if ((bestand?.n ?? 0) >= MAX_ARTIKEL) {
    return stammdatenGrenze(`Es sind höchstens ${MAX_ARTIKEL} Artikel möglich.`);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO artikel
           (id, name, name_vergleich, einheit, lager_id, version, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.name,
        namenVergleich(eingabe.name),
        eingabe.einheit,
        eingabe.lagerId,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch (ursache) {
    if (istNamensKollision(ursache)) {
      return stammdatenNameVergeben('Diesen Artikel gibt es schon.');
    }
    if (istKennungsKollision(ursache)) {
      return bereitsVorhanden('Ein Artikel mit dieser Kennung existiert bereits.');
    }
    if (istFremdschluesselFehler(ursache)) return lagerUnbekannt();
    throw ursache;
  }
  return jsonAntwort(
    artikelJson({
      id: eingabe.id,
      name: eingabe.name,
      einheit: eingabe.einheit,
      lager_id: eingabe.lagerId,
      version: 1,
      geaendert_am: jetzt,
      geaendert_von: identitaet.email,
    }),
    201,
    { ETag: starkesEtag(1) },
  );
}

export async function aktualisiereArtikel(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, STAMMDATEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeArtikelEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) return ungueltig('Ungültiger Artikel.');
  if (!(await lagerExistiert(db, eingabe.lagerId))) return lagerUnbekannt();
  const jetzt = new Date().toISOString();
  let ergebnis;
  try {
    ergebnis = await db
      .prepare(
        `UPDATE artikel
         SET name = ?, name_vergleich = ?, einheit = ?, lager_id = ?, geaendert_am = ?,
             geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(
        eingabe.name,
        namenVergleich(eingabe.name),
        eingabe.einheit,
        eingabe.lagerId,
        jetzt,
        identitaet.email,
        id,
        version,
      )
      .run();
  } catch (ursache) {
    if (istNamensKollision(ursache)) {
      return stammdatenNameVergeben('Diesen Artikel gibt es schon.');
    }
    if (istFremdschluesselFehler(ursache)) return lagerUnbekannt();
    throw ursache;
  }
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return jsonAntwort(
    artikelJson({
      id: eingabe.id,
      name: eingabe.name,
      einheit: eingabe.einheit,
      lager_id: eingabe.lagerId,
      version: version + 1,
      geaendert_am: jetzt,
      geaendert_von: identitaet.email,
    }),
    200,
    { ETag: starkesEtag(version + 1) },
  );
}

export async function loescheArtikel(
  anfrage: Request,
  db: D1Database,
  id: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  // Kennungen sind UUIDs ohne LIKE-Sonderzeichen; der Inhalt steht als kompaktes JSON in `kisten`.
  const inKisten = await db
    .prepare('SELECT COUNT(*) AS n FROM kisten WHERE inhalt LIKE ?')
    .bind(`%"artikelId":"${id}"%`)
    .first<{ n: number }>();
  if ((inKisten?.n ?? 0) > 0) {
    return stammdatenInNutzung('Dieser Artikel ist noch in einer Kiste enthalten.');
  }
  if (await aufbauVerweistAuf(db, 'artikelId', id)) {
    return stammdatenInNutzung('Dieser Artikel wird noch in einem Aufbau verwendet.');
  }
  const ergebnis = await db
    .prepare('DELETE FROM artikel WHERE id = ? AND version = ?')
    .bind(id, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return new Response(null, { status: 204 });
}

async function ablehnungOhneTreffer(db: D1Database, id: string): Promise<Response> {
  const vorhanden = await db
    .prepare('SELECT id FROM artikel WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  return vorhanden
    ? versionskonflikt('Der Artikel wurde zwischenzeitlich geändert. Bitte neu laden.')
    : artikelNichtGefunden();
}
