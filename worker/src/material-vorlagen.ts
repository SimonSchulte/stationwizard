import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { starkesEtag } from './etag';
import { istNichtleererText, istObjekt, istText, UUID_REGEX } from './json-lesen';
import {
  BEZEICHNUNG_MAX,
  EINHEIT_MAX,
  erwarteteVersion,
  HERKUENFTE,
  istKurztext,
  lesePruefeKoerper,
  SOLLMENGE_MAX,
  TEXT_MAX,
  VORLAGE_KOERPER_GRENZE,
} from './material-gemeinsam';

/** Prüfvorlagen: Eingabeprüfung, Liste, Einzelabruf, Anlage, Änderung, Löschen. */

interface ArtikelEingabe {
  id: string;
  bezeichnung: string;
  sollMenge: number;
  einheit: string;
  herkunft: string;
  verfallsdatumPflicht: boolean;
}

interface FachEingabe {
  id: string;
  bezeichnung: string;
  artikel: ArtikelEingabe[];
}

interface VorlageEingabe {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  grundlage: string;
  faecher: FachEingabe[];
}

function pruefeArtikel(wert: unknown): ArtikelEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istKurztext(wert['bezeichnung'], BEZEICHNUNG_MAX) ||
    typeof wert['sollMenge'] !== 'number' ||
    !Number.isInteger(wert['sollMenge']) ||
    wert['sollMenge'] < 1 ||
    wert['sollMenge'] > SOLLMENGE_MAX ||
    !istKurztext(wert['einheit'], EINHEIT_MAX) ||
    !istText(wert['herkunft']) ||
    !HERKUENFTE.has(wert['herkunft']) ||
    typeof wert['verfallsdatumPflicht'] !== 'boolean'
  ) {
    return null;
  }
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    sollMenge: wert['sollMenge'],
    einheit: wert['einheit'],
    herkunft: wert['herkunft'],
    verfallsdatumPflicht: wert['verfallsdatumPflicht'],
  };
}

function pruefeFach(wert: unknown): FachEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istKurztext(wert['bezeichnung'], BEZEICHNUNG_MAX) ||
    !Array.isArray(wert['artikel'])
  ) {
    return null;
  }
  const artikel = wert['artikel'].map(pruefeArtikel);
  if (artikel.some((a) => a === null)) return null;
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    artikel: artikel as ArtikelEingabe[],
  };
}

/**
 * Prüft den gesamten Vorlagenbaum. Doppelte Artikel- oder Fach-Ids werden
 * abgewiesen: ein Check bezieht seine Positionen über die Artikel-Id, eine
 * Dopplung machte die Zuordnung mehrdeutig.
 */
export function pruefeVorlageEingabe(wert: unknown): VorlageEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istKurztext(wert['bezeichnung'], BEZEICHNUNG_MAX) ||
    !istKurztext(wert['beschreibung'], TEXT_MAX) ||
    !istKurztext(wert['grundlage'], TEXT_MAX) ||
    !Array.isArray(wert['faecher'])
  ) {
    return null;
  }
  const faecher = wert['faecher'].map(pruefeFach);
  if (faecher.some((f) => f === null)) return null;
  const gepruefteFaecher = faecher as FachEingabe[];

  const ids = new Set<string>();
  for (const fach of gepruefteFaecher) {
    if (ids.has(fach.id)) return null;
    ids.add(fach.id);
    for (const artikel of fach.artikel) {
      if (ids.has(artikel.id)) return null;
      ids.add(artikel.id);
    }
  }

  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    beschreibung: wert['beschreibung'],
    grundlage: wert['grundlage'],
    faecher: gepruefteFaecher,
  };
}

interface VorlageZeile {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  grundlage: string;
  inhalt: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuVorlageJson(zeile: VorlageZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    beschreibung: zeile.beschreibung,
    grundlage: zeile.grundlage,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    faecher: JSON.parse(zeile.inhalt),
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

/**
 * Die Liste führt bewusst nur die Kopfdaten und zwei Kennzahlen: der Baum einer
 * einzelnen Vorlage ist gut 20 kB groß, und die Übersicht zeigt ihn nie. Wer
 * ihn braucht, lädt die Vorlage einzeln – dann auch mit ETag für ein späteres
 * `If-Match`.
 */
export async function listeVorlagen(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM pruefvorlagen ORDER BY bezeichnung')
    .all<VorlageZeile>();
  const vorlagen = ergebnis.results.map((zeile) => {
    const faecher: { artikel: unknown[] }[] = JSON.parse(zeile.inhalt);
    return {
      id: zeile.id,
      bezeichnung: zeile.bezeichnung,
      beschreibung: zeile.beschreibung,
      grundlage: zeile.grundlage,
      anzahlFaecher: faecher.length,
      anzahlArtikel: faecher.reduce((summe, fach) => summe + fach.artikel.length, 0),
      geaendertAm: zeile.geaendert_am,
      geaendertVon: zeile.geaendert_von,
    };
  });
  return jsonAntwort({ vorlagen });
}

export async function leseVorlage(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM pruefvorlagen WHERE id = ?')
    .bind(id)
    .first<VorlageZeile>();
  if (!zeile) {
    return fehlerAntwort('MATERIAL_VORLAGE_NICHT_GEFUNDEN', 'Prüfvorlage nicht gefunden.', 404);
  }
  return jsonAntwort(zuVorlageJson(zeile), 200, { ETag: starkesEtag(zeile.version) });
}

function vorlageAntwort(
  eingabe: VorlageEingabe,
  jetzt: string,
  email: string,
  status: number,
  version: number,
): Response {
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      beschreibung: eingabe.beschreibung,
      grundlage: eingabe.grundlage,
      faecher: eingabe.faecher,
      geaendertAm: jetzt,
      geaendertVon: email,
    },
    status,
    { ETag: starkesEtag(version) },
  );
}

export async function legeVorlageAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'MATERIAL_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, VORLAGE_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeVorlageEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültige Prüfvorlage.', 400);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO pruefvorlagen
           (id, bezeichnung, beschreibung, grundlage, inhalt, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.beschreibung,
        eingabe.grundlage,
        JSON.stringify(eingabe.faecher),
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return fehlerAntwort(
      'MATERIAL_VERSIONSKONFLIKT',
      'Eine Prüfvorlage mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return vorlageAntwort(eingabe, jetzt, identitaet.email, 201, 1);
}

export async function aktualisiereVorlage(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const erwartet = erwarteteVersion(anfrage);
  if (erwartet instanceof Response) return erwartet;
  const koerper = await lesePruefeKoerper(anfrage, VORLAGE_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefeVorlageEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültige Prüfvorlage.', 400);
  }
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE pruefvorlagen
       SET bezeichnung = ?, beschreibung = ?, grundlage = ?, inhalt = ?,
           geaendert_am = ?, geaendert_von = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.bezeichnung,
      eingabe.beschreibung,
      eingabe.grundlage,
      JSON.stringify(eingabe.faecher),
      jetzt,
      identitaet.email,
      id,
      erwartet,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'MATERIAL_VERSIONSKONFLIKT',
      'Die Prüfvorlage wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return vorlageAntwort(eingabe, jetzt, identitaet.email, 200, erwartet + 1);
}

/**
 * Löschen ist gesperrt, solange ein Behälter auf die Vorlage verweist. Ein
 * Fremdschlüsselfehler allein genügt hier nicht als Schutz: er käme ohne
 * eigenen Code beim Aufrufer als allgemeiner Datenbankfehler an.
 */
export async function loescheVorlage(db: D1Database, id: string): Promise<Response> {
  const verweis = await db
    .prepare('SELECT 1 AS treffer FROM behaelter WHERE vorlage_id = ? LIMIT 1')
    .bind(id)
    .first<{ treffer: number }>();
  if (verweis) {
    return fehlerAntwort(
      'MATERIAL_VORLAGE_IN_BENUTZUNG',
      'Die Prüfvorlage wird noch von mindestens einem Behälter verwendet.',
      409,
    );
  }
  const ergebnis = await db.prepare('DELETE FROM pruefvorlagen WHERE id = ?').bind(id).run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('MATERIAL_VORLAGE_NICHT_GEFUNDEN', 'Prüfvorlage nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}
