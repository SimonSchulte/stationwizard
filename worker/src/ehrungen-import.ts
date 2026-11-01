import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  IMPORT_GRENZE,
  IMPORT_MAXIMUM,
  istEchtesDatum,
  lesePruefeKoerper,
  personSchluessel,
  type PersonZeile,
  pruefeStunden,
} from './ehrungen-gemeinsam';
import { protokollAnweisung } from './ehrungen-personen';
import { istNichtleererText, istObjekt } from './json-lesen';

/** Sammelimport für Stunden bzw. Eintrittsdaten; Ergebnis je Eintrag. */

interface ImportEintrag {
  nachname: string;
  vorname: string;
  stunden: number | undefined;
  eintrittsdatum: string | undefined;
  version: number | undefined;
}

function pruefeImportEintrag(wert: unknown): ImportEintrag | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['nachname']) ||
    !istNichtleererText(wert['vorname'])
  ) {
    return null;
  }
  let stunden: number | undefined;
  if (wert['stunden'] !== undefined) {
    const geprueft = pruefeStunden(wert['stunden']);
    if (geprueft === null) return null;
    stunden = geprueft;
  }
  let eintrittsdatum: string | undefined;
  if (wert['eintrittsdatum'] !== undefined) {
    if (typeof wert['eintrittsdatum'] !== 'string' || !istEchtesDatum(wert['eintrittsdatum'])) {
      return null;
    }
    eintrittsdatum = wert['eintrittsdatum'];
  }
  let version: number | undefined;
  if (wert['version'] !== undefined) {
    if (!Number.isSafeInteger(wert['version']) || (wert['version'] as number) < 1) return null;
    version = wert['version'] as number;
  }
  if (stunden === undefined && eintrittsdatum === undefined) return null;
  return {
    nachname: wert['nachname'].trim().replace(/\s+/g, ' '),
    vorname: wert['vorname'].trim().replace(/\s+/g, ' '),
    stunden,
    eintrittsdatum,
    version,
  };
}

export type ImportErgebnis =
  'angelegt' | 'aktualisiert' | 'unveraendert' | 'nicht-gefunden' | 'konflikt' | 'doppelt';

/**
 * Sammelimport für Stunden (Textimport) und Eintrittsdaten (HiOrg): ein Aufruf
 * für den ganzen Bestand statt einer Anfrage je Person. Abgeglichen wird über
 * Nachname und Vorname. Geschrieben wird nur, was sich tatsächlich ändert;
 * eine vorhandene Person wird nur mit der Version aktualisiert, die der Client
 * gesehen hat (sonst `konflikt`, kein stilles Überschreiben). Ergebnis je
 * Eintrag in Eingabereihenfolge, damit ein einzelner Fehlschlag die übrigen
 * Zeilen nicht verwirft.
 */
export async function importiere(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const koerper = await lesePruefeKoerper(anfrage, IMPORT_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = koerper.inhalt;
  if (
    !istObjekt(eingabe) ||
    typeof eingabe['anlegen'] !== 'boolean' ||
    !Array.isArray(eingabe['eintraege']) ||
    eingabe['eintraege'].length === 0 ||
    eingabe['eintraege'].length > IMPORT_MAXIMUM
  ) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültiger Import.', 400);
  }
  const eintraege = eingabe['eintraege'].map(pruefeImportEintrag);
  if (eintraege.some((eintrag) => eintrag === null)) {
    return fehlerAntwort('EHRUNGEN_DATEI_UNGUELTIG', 'Ungültiger Import.', 400);
  }
  const anlegen = eingabe['anlegen'];

  const bestand = await db.prepare('SELECT * FROM ehrungen_personen').all<PersonZeile>();
  const nachSchluessel = new Map(bestand.results.map((zeile) => [zeile.schluessel, zeile]));
  const gesehen = new Set<string>();
  const jetzt = new Date().toISOString();
  const ergebnisse: ImportErgebnis[] = [];
  const anweisungen: D1PreparedStatement[] = [];
  /** Position im Ergebnis, die zum jeweiligen Batch-Statement gehört (nur Updates können scheitern). */
  const zuordnung: number[] = [];

  for (const eintrag of eintraege as ImportEintrag[]) {
    const schluessel = personSchluessel(eintrag.nachname, eintrag.vorname);
    if (gesehen.has(schluessel)) {
      ergebnisse.push('doppelt');
      continue;
    }
    gesehen.add(schluessel);
    const vorhanden = nachSchluessel.get(schluessel);
    if (!vorhanden) {
      if (!anlegen) {
        ergebnisse.push('nicht-gefunden');
        continue;
      }
      const neueId = crypto.randomUUID();
      anweisungen.push(
        db
          .prepare(
            `INSERT INTO ehrungen_personen
               (id, nachname, vorname, schluessel, stunden, eintrittsdatum, besondere_verdienste,
                erhalten, geaendert_am, geaendert_von, version)
             VALUES (?, ?, ?, ?, ?, ?, 0, '{}', ?, ?, 1)`,
          )
          .bind(
            neueId,
            eintrag.nachname,
            eintrag.vorname,
            schluessel,
            eintrag.stunden ?? 0,
            eintrag.eintrittsdatum ?? null,
            jetzt,
            identitaet.email,
          ),
      );
      zuordnung.push(ergebnisse.length);
      // Die Erstanlage mit Stunden ist die erste Stundenzahl der Person und wird protokolliert.
      anweisungen.push(
        protokollAnweisung(
          db,
          identitaet,
          jetzt,
          'stunden-import',
          null,
          eintrag.stunden ?? 0,
          neueId,
          1,
        ),
      );
      zuordnung.push(-1);
      ergebnisse.push('angelegt');
      continue;
    }
    const neueStunden = eintrag.stunden ?? vorhanden.stunden;
    const neuesDatum = eintrag.eintrittsdatum ?? vorhanden.eintrittsdatum;
    if (neueStunden === vorhanden.stunden && neuesDatum === vorhanden.eintrittsdatum) {
      ergebnisse.push('unveraendert');
      continue;
    }
    if (eintrag.version !== vorhanden.version) {
      ergebnisse.push('konflikt');
      continue;
    }
    anweisungen.push(
      db
        .prepare(
          `UPDATE ehrungen_personen
           SET stunden = ?, eintrittsdatum = ?, geaendert_am = ?, geaendert_von = ?,
               version = version + 1
           WHERE id = ? AND version = ?`,
        )
        .bind(neueStunden, neuesDatum, jetzt, identitaet.email, vorhanden.id, vorhanden.version),
    );
    zuordnung.push(ergebnisse.length);
    if (neueStunden !== vorhanden.stunden) {
      anweisungen.push(
        protokollAnweisung(
          db,
          identitaet,
          jetzt,
          'stunden-import',
          vorhanden.stunden,
          neueStunden,
          vorhanden.id,
          vorhanden.version + 1,
        ),
      );
      zuordnung.push(-1);
    }
    ergebnisse.push('aktualisiert');
  }

  if (anweisungen.length > 0) {
    const batch = await db.batch(anweisungen);
    batch.forEach((einzel, index) => {
      const position = zuordnung[index];
      if (einzel.meta.changes === 0 && position !== undefined && position >= 0) {
        ergebnisse[position] = 'konflikt';
      }
    });
  }
  return jsonAntwort({ ergebnisse });
}
