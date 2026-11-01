import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { EINZEL_GRENZE, lesePruefeKoerper, OV_SCHLUESSEL } from './ehrungen-gemeinsam';
import { istObjekt } from './json-lesen';

/** Zuständiger OV je Person; ohne Version, jede Anfrage setzt nur dieses Feld. */

export interface ZustaendigkeitZeile {
  person_id: string;
  ov: string;
  geaendert_am: string;
  geaendert_von: string;
}

export function zustaendigkeitZuJson(zeile: ZustaendigkeitZeile): Record<string, unknown> {
  return {
    personId: zeile.person_id,
    ov: zeile.ov,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

/**
 * Setzt oder löscht (`ov: null`) den zuständigen Ortsverband einer Person. Antwort: der neue
 * Eintrag beziehungsweise `{ personId, ov: null }`.
 */
export async function zustaendigkeitSetzen(
  anfrage: Request,
  db: D1Database,
  personId: string,
  identitaet: Benutzer,
): Promise<Response> {
  const koerper = await lesePruefeKoerper(anfrage, EINZEL_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = koerper.inhalt;
  const ov = istObjekt(eingabe) ? eingabe['ov'] : undefined;
  if (
    !istObjekt(eingabe) ||
    Object.keys(eingabe).some((schluessel) => schluessel !== 'ov') ||
    !(ov === null || (typeof ov === 'string' && (OV_SCHLUESSEL as readonly string[]).includes(ov)))
  ) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültige Angaben.', 400);
  }
  const person = await db
    .prepare('SELECT version FROM ehrungen_personen WHERE id = ?')
    .bind(personId)
    .first<{ version: number }>();
  if (!person) return fehlerAntwort('EHRUNGEN_NICHT_GEFUNDEN', 'Eintrag nicht gefunden.', 404);
  if (ov === null) {
    await db
      .prepare('DELETE FROM ehrungen_zustaendigkeit WHERE person_id = ?')
      .bind(personId)
      .run();
    return jsonAntwort({ personId, ov: null });
  }
  await db
    .prepare(
      `INSERT INTO ehrungen_zustaendigkeit (person_id, ov, geaendert_am, geaendert_von)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (person_id) DO UPDATE SET ov = ?2, geaendert_am = ?3, geaendert_von = ?4`,
    )
    .bind(personId, ov, new Date().toISOString(), identitaet.email)
    .run();
  const zeile = await db
    .prepare('SELECT * FROM ehrungen_zustaendigkeit WHERE person_id = ?')
    .bind(personId)
    .first<ZustaendigkeitZeile>();
  return jsonAntwort(zeile ? zustaendigkeitZuJson(zeile) : { personId, ov });
}
