import { type AufbauInhalt, sammleVerweise } from './einsatzplanung-aufbau-pruefung';
import { ungueltig } from './einsatzplanung-gemeinsam';

/** D1 erlaubt höchstens 100 gebundene Werte je Anweisung; mit Reserve in Blöcken abfragen. */
const BLOCK = 80;

async function zaehleVorhandene(
  db: D1Database,
  tabelle: 'artikel' | 'lager',
  ids: string[],
): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += BLOCK) {
    const teil = ids.slice(i, i + BLOCK);
    const treffer = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM ${tabelle} WHERE id IN (${teil.map(() => '?').join(', ')})`,
      )
      .bind(...teil)
      .first<{ n: number }>();
    n += treffer?.n ?? 0;
  }
  return n;
}

/** Prüft Artikel und Lager, auf die ein Aufbau verweist; liefert die abweisende Antwort oder `null`. */
export async function pruefeAufbauVerweise(
  db: D1Database,
  inhalt: AufbauInhalt,
): Promise<Response | null> {
  const { artikelIds, lagerIds } = sammleVerweise(inhalt);
  const artikel = [...artikelIds];
  if (artikel.length > 0 && (await zaehleVorhandene(db, 'artikel', artikel)) !== artikel.length) {
    return ungueltig('Ein Artikel des Aufbaus gibt es nicht.');
  }
  const lager = [...lagerIds];
  if (lager.length > 0 && (await zaehleVorhandene(db, 'lager', lager)) !== lager.length) {
    return ungueltig('Ein Lager des Aufbaus gibt es nicht.');
  }
  return null;
}

/** Verweist ein gespeicherter Aufbau oder eine Aufbau-Vorlage auf diese Kennung? Für den Löschschutz. */
export async function aufbauVerweistAuf(
  db: D1Database,
  feld: 'artikelId' | 'lagerId',
  id: string,
): Promise<boolean> {
  // Kennungen sind UUIDs ohne LIKE-Sonderzeichen; der Inhalt steht als kompaktes JSON.
  const muster = `%"${feld}":"${id}"%`;
  for (const tabelle of ['aufbauten', 'aufbau_vorlagen']) {
    const treffer = await db
      .prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE inhalt LIKE ?`)
      .bind(muster)
      .first<{ n: number }>();
    if ((treffer?.n ?? 0) > 0) return true;
  }
  return false;
}
