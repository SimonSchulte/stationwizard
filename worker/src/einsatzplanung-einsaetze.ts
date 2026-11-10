import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  bereitsVorhanden,
  EINSATZ_KOERPER_GRENZE,
  erwarteteVersion,
  lesePruefeKoerper,
  nichtGefunden,
  pruefeAnlegenVorbedingung,
  ungueltig,
  versionskonflikt,
} from './einsatzplanung-gemeinsam';
import { type Einsatz, pruefeEinsatz } from './einsatzplanung-pruefung';
import { starkesEtag } from './etag';

/** Einsätze: Liste mit Aufbau- und PEP-Kennzahlen, Einzelabruf, Anlage, Änderung mit `If-Match`. */

interface EinsatzZeile {
  id: string;
  titel: string;
  beginn: string | null;
  ende: string | null;
  ort: string | null;
  hiorg_veranstaltung_id: string | null;
  version: number;
}

interface EinsatzListenZeile extends EinsatzZeile {
  aufbau_einheiten: number | null;
  aufbau_kisten: number | null;
  aufbau_positionen: number | null;
  pep_posten: number | null;
  pep_positionen: number | null;
  pep_besetzt: number | null;
}

function zuEinsatzJson(zeile: EinsatzZeile): Einsatz {
  return {
    id: zeile.id,
    titel: zeile.titel,
    beginn: zeile.beginn,
    ende: zeile.ende,
    ort: zeile.ort,
    hiorgVeranstaltungId: zeile.hiorg_veranstaltung_id,
  };
}

function veranstaltungVergeben(): Response {
  return fehlerAntwort(
    'EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN',
    'Zu dieser HiOrg-Veranstaltung gibt es bereits einen Einsatz.',
    409,
  );
}

/** Ist die HiOrg-Veranstaltung bereits einem anderen Einsatz zugeordnet? */
async function veranstaltungBelegt(
  db: D1Database,
  veranstaltungId: string | null,
  eigeneId: string,
): Promise<boolean> {
  if (veranstaltungId === null) return false;
  const treffer = await db
    .prepare('SELECT id FROM einsaetze WHERE hiorg_veranstaltung_id = ? AND id <> ?')
    .bind(veranstaltungId, eigeneId)
    .first<{ id: string }>();
  return treffer !== null;
}

/** Übersetzt eine Indexverletzung aus einem Rennen; andere Fehler bleiben Fehler. */
function uebersetzeIndexfehler(ursache: unknown): Response {
  const meldung = ursache instanceof Error ? ursache.message : '';
  if (meldung.includes('hiorg_veranstaltung_id')) return veranstaltungVergeben();
  if (meldung.includes('UNIQUE')) {
    return bereitsVorhanden('Ein Einsatz mit dieser Kennung existiert bereits.');
  }
  throw ursache;
}

export async function listeEinsaetze(db: D1Database): Promise<Response> {
  // Ein Aufruf über den ganzen Bestand: Einsatz sowie Aufbau- und PEP-Kennzahlen per LEFT JOIN.
  const ergebnis = await db
    .prepare(
      `SELECT e.*, a.einheiten AS aufbau_einheiten, a.kisten AS aufbau_kisten,
              a.positionen AS aufbau_positionen,
              p.posten AS pep_posten, p.positionen AS pep_positionen, p.besetzt AS pep_besetzt
       FROM einsaetze e
       LEFT JOIN aufbauten a ON a.einsatz_id = e.id
       LEFT JOIN peps p ON p.einsatz_id = e.id
       ORDER BY e.beginn DESC, e.titel`,
    )
    .all<EinsatzListenZeile>();
  return jsonAntwort({
    einsaetze: ergebnis.results.map((zeile) => ({
      ...zuEinsatzJson(zeile),
      version: zeile.version,
      aufbau:
        zeile.aufbau_einheiten === null ||
        zeile.aufbau_kisten === null ||
        zeile.aufbau_positionen === null
          ? null
          : {
              einheiten: zeile.aufbau_einheiten,
              kisten: zeile.aufbau_kisten,
              positionen: zeile.aufbau_positionen,
            },
      pep:
        zeile.pep_posten === null || zeile.pep_positionen === null || zeile.pep_besetzt === null
          ? null
          : {
              posten: zeile.pep_posten,
              positionen: zeile.pep_positionen,
              besetzt: zeile.pep_besetzt,
            },
    })),
  });
}

export async function leseEinsatz(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM einsaetze WHERE id = ?')
    .bind(id)
    .first<EinsatzZeile>();
  if (!zeile) return nichtGefunden();
  return jsonAntwort(zuEinsatzJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

export async function legeEinsatzAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const vorbedingung = pruefeAnlegenVorbedingung(anfrage);
  if (vorbedingung) return vorbedingung;
  const koerper = await lesePruefeKoerper(anfrage, EINSATZ_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeEinsatz(koerper.inhalt);
  if (!eingabe) return ungueltig('Ungültiger Einsatz.');
  if (await veranstaltungBelegt(db, eingabe.hiorgVeranstaltungId, eingabe.id)) {
    return veranstaltungVergeben();
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO einsaetze
           (id, titel, beginn, ende, ort, hiorg_veranstaltung_id, version,
            angelegt_am, geaendert_am, angelegt_von, geaendert_von)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .bind(
        eingabe.id,
        eingabe.titel,
        eingabe.beginn,
        eingabe.ende,
        eingabe.ort,
        eingabe.hiorgVeranstaltungId,
        jetzt,
        jetzt,
        identitaet.email,
        identitaet.email,
      )
      .run();
  } catch (ursache) {
    return uebersetzeIndexfehler(ursache);
  }
  return jsonAntwort(eingabe, 201, { ETag: starkesEtag(1) });
}

export async function aktualisiereEinsatz(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const version = erwarteteVersion(anfrage);
  if (version instanceof Response) return version;
  const koerper = await lesePruefeKoerper(anfrage, EINSATZ_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeEinsatz(koerper.inhalt);
  if (!eingabe || eingabe.id.toLowerCase() !== id.toLowerCase()) {
    return ungueltig('Ungültiger Einsatz.');
  }
  if (await veranstaltungBelegt(db, eingabe.hiorgVeranstaltungId, id)) {
    return veranstaltungVergeben();
  }
  let ergebnis;
  try {
    ergebnis = await db
      .prepare(
        `UPDATE einsaetze
         SET titel = ?, beginn = ?, ende = ?, ort = ?, hiorg_veranstaltung_id = ?,
             geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(
        eingabe.titel,
        eingabe.beginn,
        eingabe.ende,
        eingabe.ort,
        eingabe.hiorgVeranstaltungId,
        new Date().toISOString(),
        identitaet.email,
        id,
        version,
      )
      .run();
  } catch (ursache) {
    return uebersetzeIndexfehler(ursache);
  }
  if (ergebnis.meta.changes === 0) {
    const vorhanden = await db
      .prepare('SELECT id FROM einsaetze WHERE id = ?')
      .bind(id)
      .first<{ id: string }>();
    return vorhanden
      ? versionskonflikt('Der Einsatz wurde zwischenzeitlich geändert. Bitte neu laden.')
      : nichtGefunden();
  }
  return jsonAntwort(eingabe, 200, { ETag: starkesEtag(version + 1) });
}
