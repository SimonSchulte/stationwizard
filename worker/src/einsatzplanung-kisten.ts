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
  KISTEN_KOERPER_GRENZE,
  MAX_KISTEN,
  namenVergleich,
  pruefeKisteEingabe,
  stammdatenGrenze,
  stammdatenNameVergeben,
  type KisteEingabe,
  type KistenPositionEingabe,
} from './einsatzplanung-stammdaten';
import { starkesEtag } from './etag';

/**
 * Kisten: Stammdaten mit Name, Heimatlager und Inhalt aus Artikeln (Konzept
 * `docs/konzept-packeinheiten.md`, Stufe 2). Alle Kisten samt Inhalt kommen in einem Aufruf; Version
 * je Zeile, Anlage mit `If-None-Match: *`, Änderung und Löschen mit `If-Match`.
 */

interface KistenZeile {
  id: string;
  name: string;
  lager_id: string | null;
  inhalt: string;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

function kisteJson(
  kopf: Pick<
    KistenZeile,
    'id' | 'name' | 'lager_id' | 'version' | 'geaendert_am' | 'geaendert_von'
  >,
  inhalt: KistenPositionEingabe[],
) {
  return {
    id: kopf.id,
    name: kopf.name,
    lagerId: kopf.lager_id,
    inhalt,
    version: kopf.version,
    geaendertAm: kopf.geaendert_am,
    geaendertVon: kopf.geaendert_von,
  };
}

function kisteNichtGefunden(): Response {
  return fehlerAntwort('EINSATZPLANUNG_KISTE_NICHT_GEFUNDEN', 'Kiste nicht gefunden.', 404);
}

/** Prüft Heimatlager und Artikel gegen die Datenbank; liefert die abweisende Antwort oder `null`. */
async function pruefeVerweise(db: D1Database, eingabe: KisteEingabe): Promise<Response | null> {
  if (eingabe.lagerId !== null) {
    const lager = await db
      .prepare('SELECT id FROM lager WHERE id = ?')
      .bind(eingabe.lagerId)
      .first<{ id: string }>();
    if (!lager) return ungueltig('Das Heimatlager gibt es nicht.');
  }
  const ids = eingabe.inhalt.map((position) => position.artikelId);
  if (ids.length === 0) return null;
  const treffer = await db
    .prepare(`SELECT id FROM artikel WHERE id IN (${ids.map(() => '?').join(', ')})`)
    .bind(...ids)
    .all<{ id: string }>();
  if (treffer.results.length !== ids.length)
    return ungueltig('Ein Artikel der Kiste gibt es nicht.');
  return null;
}

export async function listeKisten(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT id, name, lager_id, inhalt, version, geaendert_am, geaendert_von
       FROM kisten ORDER BY name`,
    )
    .all<KistenZeile>();
  return jsonAntwort({
    kisten: ergebnis.results.map((zeile) =>
      // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
      kisteJson(zeile, JSON.parse(zeile.inhalt) as KistenPositionEingabe[]),
    ),
  });
}

export async function legeKisteAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = pruefeAnlegenVorbedingung(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, KISTEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeKisteEingabe(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültige Kiste.');
  const abweisung = await pruefeVerweise(db, eingabe);
  if (abweisung) return abweisung;
  const bestand = await db.prepare('SELECT COUNT(*) AS n FROM kisten').first<{ n: number }>();
  if ((bestand?.n ?? 0) >= MAX_KISTEN) {
    return stammdatenGrenze(`Es sind höchstens ${MAX_KISTEN} Kisten möglich.`);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO kisten
           (id, name, name_vergleich, lager_id, inhalt, positionen, version, geaendert_am,
            geaendert_von)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.name,
        namenVergleich(eingabe.name),
        eingabe.lagerId,
        JSON.stringify(eingabe.inhalt),
        eingabe.inhalt.length,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch (ursache) {
    if (istNamensKollision(ursache)) return stammdatenNameVergeben('Diese Kiste gibt es schon.');
    if (istKennungsKollision(ursache)) {
      return bereitsVorhanden('Eine Kiste mit dieser Kennung existiert bereits.');
    }
    if (istFremdschluesselFehler(ursache)) return ungueltig('Das Heimatlager gibt es nicht.');
    throw ursache;
  }
  return jsonAntwort(
    kisteJson(
      {
        id: eingabe.id,
        name: eingabe.name,
        lager_id: eingabe.lagerId,
        version: 1,
        geaendert_am: jetzt,
        geaendert_von: identitaet.email,
      },
      eingabe.inhalt,
    ),
    201,
    { ETag: starkesEtag(1) },
  );
}

export async function aktualisiereKiste(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, KISTEN_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeKisteEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) return ungueltig('Ungültige Kiste.');
  const abweisung = await pruefeVerweise(db, eingabe);
  if (abweisung) return abweisung;
  const jetzt = new Date().toISOString();
  let ergebnis;
  try {
    ergebnis = await db
      .prepare(
        `UPDATE kisten
         SET name = ?, name_vergleich = ?, lager_id = ?, inhalt = ?, positionen = ?,
             geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(
        eingabe.name,
        namenVergleich(eingabe.name),
        eingabe.lagerId,
        JSON.stringify(eingabe.inhalt),
        eingabe.inhalt.length,
        jetzt,
        identitaet.email,
        id,
        version,
      )
      .run();
  } catch (ursache) {
    if (istNamensKollision(ursache)) return stammdatenNameVergeben('Diese Kiste gibt es schon.');
    if (istFremdschluesselFehler(ursache)) return ungueltig('Das Heimatlager gibt es nicht.');
    throw ursache;
  }
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return jsonAntwort(
    kisteJson(
      {
        id: eingabe.id,
        name: eingabe.name,
        lager_id: eingabe.lagerId,
        version: version + 1,
        geaendert_am: jetzt,
        geaendert_von: identitaet.email,
      },
      eingabe.inhalt,
    ),
    200,
    { ETag: starkesEtag(version + 1) },
  );
}

export async function loescheKiste(
  anfrage: Request,
  db: D1Database,
  id: string,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const ergebnis = await db
    .prepare('DELETE FROM kisten WHERE id = ? AND version = ?')
    .bind(id, version)
    .run();
  if (ergebnis.meta.changes === 0) return await ablehnungOhneTreffer(db, id);
  return new Response(null, { status: 204 });
}

async function ablehnungOhneTreffer(db: D1Database, id: string): Promise<Response> {
  const vorhanden = await db
    .prepare('SELECT id FROM kisten WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  return vorhanden
    ? versionskonflikt('Die Kiste wurde zwischenzeitlich geändert. Bitte neu laden.')
    : kisteNichtGefunden();
}
