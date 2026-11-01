import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { EHRUNG_SCHLUESSEL, lesePruefeKoerper } from './ehrungen-gemeinsam';
import { type ZustaendigkeitZeile, zustaendigkeitZuJson } from './ehrungen-zustaendigkeit';
import { istObjekt } from './json-lesen';

/** Haken „Abgestimmt OB“/„Beantragt“, Begründung und Antragszeitpunkt je Person und Auszeichnung. */

interface VorgangZeile {
  person_id: string;
  auszeichnung: string;
  abgestimmt_ob: number;
  beantragt: number;
  begruendung: string | null;
  antrag_erstellt_am: string | null;
  geaendert_am: string;
  geaendert_von: string;
}

/** Freitext für das Feld „Begründung“ des Antragsformulars. */
const BEGRUENDUNG_GRENZE = 2000;
/** Eine Begründung mit 2000 Zeichen kann in UTF-8 deutlich mehr als 4 KB belegen. */
const VORGANG_GRENZE = 16 * 1024;

function vorgangZuJson(zeile: VorgangZeile): Record<string, unknown> {
  return {
    personId: zeile.person_id,
    auszeichnung: zeile.auszeichnung,
    abgestimmtOb: zeile.abgestimmt_ob === 1,
    beantragt: zeile.beantragt === 1,
    begruendung: zeile.begruendung ?? '',
    antragErstelltAm: zeile.antrag_erstellt_am ?? null,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

/** Alle Haken in einem Aufruf (Free-Tier: kein Abruf je Person). */
export async function vorgaengeListe(db: D1Database): Promise<Response> {
  const ergebnis = await db.prepare('SELECT * FROM ehrungen_vorgaenge').all<VorgangZeile>();
  const zustaendig = await db
    .prepare('SELECT * FROM ehrungen_zustaendigkeit')
    .all<ZustaendigkeitZeile>();
  return jsonAntwort({
    vorgaenge: ergebnis.results.map(vorgangZuJson),
    zustaendigkeiten: zustaendig.results.map(zustaendigkeitZuJson),
  });
}

const VORGANG_FELDER = ['abgestimmtOb', 'beantragt', 'begruendung', 'antragErstellt'];

/**
 * Setzt „Abgestimmt OB“, „Beantragt“, die Begründung und/oder vermerkt einen erstellten Antrag.
 * Nur die genannten Felder ändern sich. Zeitpunkte und Benutzer kommen aus der geprüften
 * Anmeldung; `antragErstellt` ist nur `true` und setzt den Zeitpunkt serverseitig sowie
 * `beantragt`.
 */
export async function vorgangSetzen(
  anfrage: Request,
  db: D1Database,
  personId: string,
  auszeichnung: string,
  identitaet: Benutzer,
): Promise<Response> {
  if (!(EHRUNG_SCHLUESSEL as readonly string[]).includes(auszeichnung)) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Unbekannte Auszeichnung.', 400);
  }
  const koerper = await lesePruefeKoerper(anfrage, VORGANG_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = koerper.inhalt;
  if (
    !istObjekt(eingabe) ||
    Object.keys(eingabe).length === 0 ||
    Object.keys(eingabe).some((schluessel) => !VORGANG_FELDER.includes(schluessel))
  ) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültige Angaben.', 400);
  }
  const abgestimmt = eingabe['abgestimmtOb'];
  const beantragt = eingabe['beantragt'];
  const begruendungRoh = eingabe['begruendung'];
  const antragErstellt = eingabe['antragErstellt'];
  const begruendung = typeof begruendungRoh === 'string' ? begruendungRoh.trim() : undefined;
  if (
    (abgestimmt !== undefined && typeof abgestimmt !== 'boolean') ||
    (beantragt !== undefined && typeof beantragt !== 'boolean') ||
    (begruendungRoh !== undefined &&
      (begruendung === undefined || begruendung.length > BEGRUENDUNG_GRENZE)) ||
    (antragErstellt !== undefined && antragErstellt !== true) ||
    (antragErstellt === true && beantragt === false)
  ) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültige Angaben.', 400);
  }
  const person = await db
    .prepare('SELECT version FROM ehrungen_personen WHERE id = ?')
    .bind(personId)
    .first<{ version: number }>();
  if (!person) return fehlerAntwort('EHRUNGEN_NICHT_GEFUNDEN', 'Eintrag nicht gefunden.', 404);
  const jetzt = new Date().toISOString();
  // Fehlendes Feld: -1 = unverändert (beim Einfügen 0).
  const wert = (feld: unknown) => (feld === undefined ? -1 : feld ? 1 : 0);
  await db
    .prepare(
      `INSERT INTO ehrungen_vorgaenge (person_id, auszeichnung, abgestimmt_ob, beantragt, begruendung, antrag_erstellt_am, geaendert_am, geaendert_von)
       VALUES (?1, ?2, MAX(?3, 0), MAX(?4, 0), ?6, CASE WHEN ?7 = 1 THEN ?8 ELSE NULL END, ?8, ?9)
       ON CONFLICT (person_id, auszeichnung) DO UPDATE SET
         abgestimmt_ob = CASE WHEN ?3 < 0 THEN abgestimmt_ob ELSE ?3 END,
         beantragt = CASE WHEN ?4 < 0 THEN beantragt ELSE ?4 END,
         begruendung = CASE WHEN ?5 = 1 THEN ?6 ELSE begruendung END,
         antrag_erstellt_am = CASE WHEN ?7 = 1 THEN ?8 ELSE antrag_erstellt_am END,
         geaendert_am = ?8, geaendert_von = ?9`,
    )
    .bind(
      personId,
      auszeichnung,
      wert(abgestimmt),
      antragErstellt === true ? 1 : wert(beantragt),
      begruendung === undefined ? 0 : 1,
      begruendung ? begruendung : null,
      antragErstellt === true ? 1 : 0,
      jetzt,
      identitaet.email,
    )
    .run();
  const zeile = await db
    .prepare('SELECT * FROM ehrungen_vorgaenge WHERE person_id = ? AND auszeichnung = ?')
    .bind(personId, auszeichnung)
    .first<VorgangZeile>();
  return jsonAntwort(zeile ? vorgangZuJson(zeile) : {});
}
