import { type AufbauInhalt, sammleVerweise } from './einsatzplanung-aufbau-pruefung';
import { ungueltig } from './einsatzplanung-gemeinsam';
import { leseGespeichertePlaetze } from './einsatzplanung-stammdaten';

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

/** Gehört jeder Platz (`lagerId/platzId`) zu dem Lager, mit dem er im Aufbau steht? */
async function plaetzeGehoeren(db: D1Database, schluessel: string[]): Promise<boolean> {
  const lagerIds = [...new Set(schluessel.map((k) => k.split('/')[0]!))];
  const vorhanden = new Set<string>();
  for (let i = 0; i < lagerIds.length; i += BLOCK) {
    const teil = lagerIds.slice(i, i + BLOCK);
    const zeilen = await db
      .prepare(`SELECT id, plaetze FROM lager WHERE id IN (${teil.map(() => '?').join(', ')})`)
      .bind(...teil)
      .all<{ id: string; plaetze: string }>();
    for (const zeile of zeilen.results) {
      for (const platz of leseGespeichertePlaetze(zeile.plaetze)) {
        vorhanden.add(`${zeile.id}/${platz.id}`);
      }
    }
  }
  return schluessel.every((k) => vorhanden.has(k));
}

/** Prüft Artikel und Lager, auf die ein Aufbau verweist; liefert die abweisende Antwort oder `null`. */
export async function pruefeAufbauVerweise(
  db: D1Database,
  inhalt: AufbauInhalt,
): Promise<Response | null> {
  const { artikelIds, lagerIds, plaetze } = sammleVerweise(inhalt);
  const artikel = [...artikelIds];
  if (artikel.length > 0 && (await zaehleVorhandene(db, 'artikel', artikel)) !== artikel.length) {
    return ungueltig('Ein Artikel des Aufbaus gibt es nicht.');
  }
  const lager = [...lagerIds];
  if (lager.length > 0 && (await zaehleVorhandene(db, 'lager', lager)) !== lager.length) {
    return ungueltig('Ein Lager des Aufbaus gibt es nicht.');
  }
  if (plaetze.size > 0 && !(await plaetzeGehoeren(db, [...plaetze.keys()]))) {
    return ungueltig('Ein Platz des Aufbaus gehört nicht zu seinem Lager.');
  }
  return null;
}

/** Verweist ein gespeicherter Aufbau oder eine Aufbau-Vorlage auf diese Kennung? Für den Löschschutz. */
export async function aufbauVerweistAuf(
  db: D1Database,
  feld: 'artikelId' | 'lagerId' | 'platzId',
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
