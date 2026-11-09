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
  istKennungsKollision,
  istNamensKollision,
  MAX_LAGER,
  namenVergleich,
  pruefeLagerEingabe,
  STAMMDATEN_KOERPER_GRENZE,
  stammdatenGrenze,
  stammdatenInNutzung,
  stammdatenNameVergeben,
} from './einsatzplanung-stammdaten';
import { starkesEtag } from './etag';
import { UUID_REGEX, istObjekt } from './json-lesen';

/**
 * Lager: feste Liste mit Reihenfolge (Laufweg). Version je Zeile; die Reihenfolge ändert ein
 * eigener Aufruf, der alle Lager in einem Schreibvorgang neu nummeriert.
 */

interface LagerZeile {
  id: string;
  name: string;
  reihenfolge: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

function lagerJson(zeile: LagerZeile) {
  return {
    id: zeile.id,
    name: zeile.name,
    reihenfolge: zeile.reihenfolge,
    version: zeile.version,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

function lagerNichtGefunden(): Response {
  return fehlerAntwort('EINSATZPLANUNG_LAGER_NICHT_GEFUNDEN', 'Lager nicht gefunden.', 404);
}

async function alleLager(db: D1Database): Promise<LagerZeile[]> {
  const ergebnis = await db
    .prepare(
      `SELECT id, name, reihenfolge, version, geaendert_am, geaendert_von
       FROM lager ORDER BY reihenfolge, name`,
    )
    .all<LagerZeile>();
  return ergebnis.results;
}

export async function listeLager(db: D1Database): Promise<Response> {
  return jsonAntwort({ lager: (await alleLager(db)).map(lagerJson) });
}

export async function legeLagerAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = pruefeAnlegenVorbedingung(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, STAMMDATEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeLagerEingabe(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültiges Lager.');
  const bestand = await db
    .prepare('SELECT COUNT(*) AS n, COALESCE(MAX(reihenfolge), 0) AS hoechste FROM lager')
    .first<{ n: number; hoechste: number }>();
  if ((bestand?.n ?? 0) >= MAX_LAGER) {
    return stammdatenGrenze(`Es sind höchstens ${MAX_LAGER} Lager möglich.`);
  }
  const reihenfolge = (bestand?.hoechste ?? 0) + 1;
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO lager
           (id, name, name_vergleich, reihenfolge, version, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.name,
        namenVergleich(eingabe.name),
        reihenfolge,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch (ursache) {
    if (istNamensKollision(ursache)) return stammdatenNameVergeben('Dieses Lager gibt es schon.');
    if (istKennungsKollision(ursache)) {
      return bereitsVorhanden('Ein Lager mit dieser Kennung existiert bereits.');
    }
    throw ursache;
  }
  return jsonAntwort(
    lagerJson({
      id: eingabe.id,
      name: eingabe.name,
      reihenfolge,
      version: 1,
      geaendert_am: jetzt,
      geaendert_von: identitaet.email,
    }),
    201,
    { ETag: starkesEtag(1) },
  );
}

export async function aktualisiereLager(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, STAMMDATEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeLagerEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id.toLowerCase()) return ungueltig('Ungültiges Lager.');
  const jetzt = new Date().toISOString();
  let ergebnis;
  try {
    ergebnis = await db
      .prepare(
        `UPDATE lager
         SET name = ?, name_vergleich = ?, geaendert_am = ?, geaendert_von = ?,
             version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(eingabe.name, namenVergleich(eingabe.name), jetzt, identitaet.email, id, version)
      .run();
  } catch (ursache) {
    if (istNamensKollision(ursache)) return stammdatenNameVergeben('Dieses Lager gibt es schon.');
    throw ursache;
  }
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  const aktuell = await db
    .prepare(
      `SELECT id, name, reihenfolge, version, geaendert_am, geaendert_von
       FROM lager WHERE id = ?`,
    )
    .bind(id)
    .first<LagerZeile>();
  if (!aktuell) return lagerNichtGefunden();
  return jsonAntwort(lagerJson(aktuell), 200, { ETag: starkesEtag(aktuell.version) });
}

export async function loescheLager(
  anfrage: Request,
  db: D1Database,
  id: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const verwendet = await db
    .prepare('SELECT COUNT(*) AS n FROM artikel WHERE lager_id = ?')
    .bind(id)
    .first<{ n: number }>();
  if ((verwendet?.n ?? 0) > 0) {
    return stammdatenInNutzung('Dieses Lager ist noch Heimatlager von Artikeln.');
  }
  const ergebnis = await db
    .prepare('DELETE FROM lager WHERE id = ? AND version = ?')
    .bind(id, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return new Response(null, { status: 204 });
}

/**
 * Setzt die Reihenfolge aller Lager in einem Schreibvorgang. Der Körper nennt genau die Ids
 * aller vorhandenen Lager in der neuen Reihenfolge; weicht die Menge ab (zwischenzeitlich
 * angelegt oder gelöscht), antwortet der Worker mit 412. Ohne Version: idempotent.
 */
export async function setzeLagerReihenfolge(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const koerper = await lesePruefeKoerper(anfrage, STAMMDATEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const inhalt = koerper.inhalt;
  if (
    !istObjekt(inhalt) ||
    Object.keys(inhalt).some((schluessel) => schluessel !== 'ids') ||
    !Array.isArray(inhalt['ids']) ||
    inhalt['ids'].length > MAX_LAGER ||
    !inhalt['ids'].every((id) => typeof id === 'string' && UUID_REGEX.test(id))
  ) {
    return ungueltig('Ungültige Reihenfolge.');
  }
  const ids = (inhalt['ids'] as string[]).map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) return ungueltig('Ungültige Reihenfolge.');
  const bestehend = await alleLager(db);
  if (bestehend.length !== ids.length || !bestehend.every((zeile) => ids.includes(zeile.id))) {
    return versionskonflikt('Die Lagerliste hat sich geändert. Bitte neu laden.');
  }
  const jetzt = new Date().toISOString();
  const nachId = new Map(bestehend.map((zeile) => [zeile.id, zeile]));
  const geaendert = ids.filter((id, index) => nachId.get(id)?.reihenfolge !== index + 1);
  if (geaendert.length > 0) {
    await db.batch(
      geaendert.map((id) =>
        db
          .prepare(
            'UPDATE lager SET reihenfolge = ?, geaendert_am = ?, geaendert_von = ? WHERE id = ?',
          )
          .bind(ids.indexOf(id) + 1, jetzt, identitaet.email, id),
      ),
    );
  }
  return await listeLager(db);
}

async function ablehnungOhneTreffer(db: D1Database, id: string): Promise<Response> {
  const vorhanden = await db
    .prepare('SELECT id FROM lager WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  return vorhanden
    ? versionskonflikt('Das Lager wurde zwischenzeitlich geändert. Bitte neu laden.')
    : lagerNichtGefunden();
}
