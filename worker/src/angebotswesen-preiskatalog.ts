import {
  lesePruefeKoerper,
  PREISKATALOG_ARTEN,
  PREISKATALOG_KOERPER_GRENZE,
} from './angebotswesen-gemeinsam';
import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { versionAusEtag } from './etag';
import { istNichtleererText, istObjekt, istText, UUID_REGEX } from './json-lesen';

/** Preiskatalog: frei erweiterbare Liste, Version je Zeile, Preise in Integer-Cent. */

interface PreiskatalogEingabe {
  id: string;
  bezeichnung: string;
  art: string;
  einzelpreisCent: number;
}

function pruefePreiskatalogEingabe(wert: unknown): PreiskatalogEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istText(wert['art']) ||
    !PREISKATALOG_ARTEN.has(wert['art']) ||
    typeof wert['einzelpreisCent'] !== 'number' ||
    !Number.isInteger(wert['einzelpreisCent']) ||
    wert['einzelpreisCent'] < 0
  ) {
    return null;
  }
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    art: wert['art'],
    einzelpreisCent: wert['einzelpreisCent'],
  };
}

interface PreiskatalogZeile {
  id: string;
  bezeichnung: string;
  art: string;
  einzelpreis_cent: number;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

function zuPreiskatalogJson(zeile: PreiskatalogZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    art: zeile.art,
    einzelpreisCent: zeile.einzelpreis_cent,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
    // Bewusste Abweichung vom Fahrzeuge-Einzel-ETag-Muster: bei vielen
    // kleinen, inline editierbaren Zeilen wäre ein `ladeEintrag(id)`-
    // Roundtrip vor jeder Änderung ein Verstoß gegen die Sparsamkeitsregel.
    version: zeile.version,
  };
}

export async function listePreiskatalog(db: D1Database): Promise<Response> {
  const ergebnis = await db
    .prepare('SELECT * FROM preiskatalog_eintraege ORDER BY bezeichnung')
    .all<PreiskatalogZeile>();
  return jsonAntwort({ eintraege: ergebnis.results.map(zuPreiskatalogJson) });
}

export async function legePreiskatalogEintragAn(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const koerper = await lesePruefeKoerper(anfrage, PREISKATALOG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefePreiskatalogEingabe(koerper.inhalt);
  if (!eingabe) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiger Preiskatalog-Eintrag.', 400);
  }
  const jetzt = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO preiskatalog_eintraege
           (id, bezeichnung, art, einzelpreis_cent, geaendert_am, geaendert_von, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        eingabe.id,
        eingabe.bezeichnung,
        eingabe.art,
        eingabe.einzelpreisCent,
        jetzt,
        identitaet.email,
      )
      .run();
  } catch {
    return fehlerAntwort(
      'PREISKATALOG_KONFLIKT',
      'Ein Eintrag mit dieser Kennung existiert bereits.',
      412,
    );
  }
  return jsonAntwort(
    {
      id: eingabe.id,
      bezeichnung: eingabe.bezeichnung,
      art: eingabe.art,
      einzelpreisCent: eingabe.einzelpreisCent,
      geaendertAm: jetzt,
      geaendertVon: identitaet.email,
      version: 1,
    },
    201,
  );
}

export async function aktualisierePreiskatalogEintrag(
  anfrage: Request,
  db: D1Database,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const ifMatch = anfrage.headers.get('If-Match');
  if (!ifMatch) {
    return fehlerAntwort(
      'ANGEBOTSWESEN_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden und die aktuelle Version mitsenden.',
      428,
    );
  }
  const erwarteteVersion = versionAusEtag(ifMatch);
  if (erwarteteVersion === null) {
    return fehlerAntwort('ANGEBOTSWESEN_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  const koerper = await lesePruefeKoerper(anfrage, PREISKATALOG_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const eingabe = pruefePreiskatalogEingabe(koerper.inhalt);
  if (!eingabe || eingabe.id !== id) {
    return fehlerAntwort('ANGEBOTSWESEN_DATEI_UNGUELTIG', 'Ungültiger Preiskatalog-Eintrag.', 400);
  }
  const jetzt = new Date().toISOString();
  const ergebnis = await db
    .prepare(
      `UPDATE preiskatalog_eintraege
       SET bezeichnung = ?, art = ?, einzelpreis_cent = ?, geaendert_am = ?, geaendert_von = ?,
           version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      eingabe.bezeichnung,
      eingabe.art,
      eingabe.einzelpreisCent,
      jetzt,
      identitaet.email,
      id,
      erwarteteVersion,
    )
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'PREISKATALOG_KONFLIKT',
      'Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.',
      412,
    );
  }
  return jsonAntwort({
    id: eingabe.id,
    bezeichnung: eingabe.bezeichnung,
    art: eingabe.art,
    einzelpreisCent: eingabe.einzelpreisCent,
    geaendertAm: jetzt,
    geaendertVon: identitaet.email,
    version: erwarteteVersion + 1,
  });
}

export async function loeschePreiskatalogEintrag(db: D1Database, id: string): Promise<Response> {
  const ergebnis = await db
    .prepare('DELETE FROM preiskatalog_eintraege WHERE id = ?')
    .bind(id)
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort('PREISKATALOG_NICHT_GEFUNDEN', 'Eintrag nicht gefunden.', 404);
  }
  return new Response(null, { status: 204 });
}
