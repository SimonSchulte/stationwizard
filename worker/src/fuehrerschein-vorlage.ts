import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { Groessenfehler, istZip, leseBegrenzt } from './binaer-lesen';
import { ursachenText } from './diagnose';
import { starkesEtag, versionAusEtag } from './etag';

/**
 * Word-Vorlage der Führerscheinliste (`personal/pages/fuehrerscheinliste/`):
 * ein einzelnes, hinterlegtes `.docx`, das im Verwaltungsbereich ersetzt
 * werden kann (`personal/pages/fuehrerschein-vorlage-verwaltung/`) und dessen
 * Tabelle der Client mit den Fahrerlaubnisdaten füllt (siehe
 * `personal/services/fuehrerschein-dokument.ts`) – der Worker liest oder
 * schreibt dabei nie in die Datei hinein, er verwahrt sie nur. Genau eine
 * Zeile mit fester `id`; Migration 0012.
 */
export interface FuehrerscheinVorlageKonfiguration {
  BENUTZER_DB?: D1Database;
}

export const FUEHRERSCHEIN_VORLAGE_PFAD = '/api/personal/fuehrerschein-vorlage';
export const FUEHRERSCHEIN_VORLAGE_DATEI_PFAD = '/api/personal/fuehrerschein-vorlage/datei';

const VORLAGE_ID = 'fuehrerscheinliste';
const DOCX_INHALTSTYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Großzügig für ein einseitiges Formular, aber begrenzt gegen das Tageskontingent. */
const VORLAGE_GRENZE = 5 * 1024 * 1024;
/** Kein Pfadtrenner, kein Anführungszeichen (Content-Disposition), keine Steuerzeichen. */
const DATEINAME_MUSTER = /^[^\\/"\x00-\x1f]{1,200}\.docx$/i;

interface VorlageMetaZeile {
  dateiname: string;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

function metadatenJson(zeile: VorlageMetaZeile | null): Record<string, unknown> {
  if (!zeile) {
    return {
      vorhanden: false,
      dateiname: null,
      version: null,
      geaendertAm: null,
      geaendertVon: null,
    };
  }
  return {
    vorhanden: true,
    dateiname: zeile.dateiname,
    version: zeile.version,
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

async function leseMetadaten(db: D1Database): Promise<Response> {
  const zeile = await db
    .prepare(
      'SELECT dateiname, version, geaendert_am, geaendert_von FROM fuehrerschein_vorlage WHERE id = ?',
    )
    .bind(VORLAGE_ID)
    .first<VorlageMetaZeile>();
  return jsonAntwort(metadatenJson(zeile), 200, zeile ? { ETag: starkesEtag(zeile.version) } : {});
}

async function leseDatei(db: D1Database): Promise<Response> {
  const zeile = await db
    .prepare('SELECT dateiname, inhalt, version FROM fuehrerschein_vorlage WHERE id = ?')
    .bind(VORLAGE_ID)
    .first<{ dateiname: string; inhalt: ArrayBuffer; version: number }>();
  if (!zeile) {
    return fehlerAntwort('FUEHRERSCHEIN_VORLAGE_NICHT_GEFUNDEN', 'Keine Vorlage hinterlegt.', 404);
  }
  return new Response(zeile.inhalt, {
    status: 200,
    headers: {
      'Content-Type': DOCX_INHALTSTYP,
      'Content-Disposition': `attachment; filename="${zeile.dateiname}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ETag: starkesEtag(zeile.version),
    },
  });
}

async function schreibeVorlage(
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const beiUebereinstimmung = anfrage.headers.get('If-Match');
  const beiNichtvorhandensein = anfrage.headers.get('If-None-Match');
  if (!beiUebereinstimmung && !beiNichtvorhandensein) {
    return fehlerAntwort(
      'FUEHRERSCHEIN_VORLAGE_VORBEDINGUNG_FEHLT',
      'Zum Speichern zuerst laden oder eine neue Vorlage ausdrücklich anlegen.',
      428,
    );
  }
  if (beiUebereinstimmung && beiNichtvorhandensein) {
    return fehlerAntwort('FUEHRERSCHEIN_VORLAGE_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }
  let erwarteteVersion: number | null = null;
  if (beiUebereinstimmung) {
    erwarteteVersion = versionAusEtag(beiUebereinstimmung);
    if (erwarteteVersion === null) {
      return fehlerAntwort(
        'FUEHRERSCHEIN_VORLAGE_VORBEDINGUNG_UNGUELTIG',
        'Ungültige Version.',
        400,
      );
    }
  } else if (beiNichtvorhandensein !== '*') {
    return fehlerAntwort('FUEHRERSCHEIN_VORLAGE_VORBEDINGUNG_UNGUELTIG', 'Ungültige Version.', 400);
  }

  const dateiname = anfrage.headers.get('X-Stationwizard-Dateiname');
  if (!dateiname || !DATEINAME_MUSTER.test(dateiname)) {
    return fehlerAntwort('FUEHRERSCHEIN_VORLAGE_DATEINAME_UNGUELTIG', 'Ungültiger Dateiname.', 400);
  }

  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== DOCX_INHALTSTYP && inhaltstyp !== 'application/octet-stream') {
    return fehlerAntwort(
      'FUEHRERSCHEIN_VORLAGE_INHALTSTYP_UNGUELTIG',
      'Unzulässiger Dateityp.',
      415,
    );
  }

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 30_000);
  let inhalt: Uint8Array<ArrayBuffer>;
  try {
    inhalt = await leseBegrenzt(anfrage, VORLAGE_GRENZE, abbruch.signal);
  } catch (fehler) {
    if (abbruch.signal.aborted) {
      return fehlerAntwort(
        'FUEHRERSCHEIN_VORLAGE_UPLOAD_ZEITLIMIT',
        'Die Datei wurde nicht rechtzeitig übertragen.',
        408,
      );
    }
    return fehlerAntwort(
      fehler instanceof Groessenfehler
        ? 'FUEHRERSCHEIN_VORLAGE_ZU_GROSS'
        : 'FUEHRERSCHEIN_VORLAGE_UNLESBAR',
      fehler instanceof Groessenfehler ? 'Die Datei ist zu groß.' : 'Die Datei ist nicht lesbar.',
      fehler instanceof Groessenfehler ? 413 : 400,
    );
  } finally {
    clearTimeout(zeitlimit);
  }
  if (!istZip(inhalt)) {
    return fehlerAntwort('FUEHRERSCHEIN_VORLAGE_UNGUELTIG', 'Ungültiger Dateiinhalt.', 400);
  }

  const jetzt = new Date().toISOString();

  if (erwarteteVersion !== null) {
    const ergebnis = await db
      .prepare(
        `UPDATE fuehrerschein_vorlage
         SET dateiname = ?, inhalt = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(dateiname, inhalt.buffer, jetzt, identitaet.email, VORLAGE_ID, erwarteteVersion)
      .run();
    if (ergebnis.meta.changes === 0) {
      return fehlerAntwort(
        'FUEHRERSCHEIN_VORLAGE_KONFLIKT',
        'Die Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.',
        412,
      );
    }
    return jsonAntwort(
      {
        vorhanden: true,
        dateiname,
        version: erwarteteVersion + 1,
        geaendertAm: jetzt,
        geaendertVon: identitaet.email,
      },
      200,
      { ETag: starkesEtag(erwarteteVersion + 1) },
    );
  }

  try {
    await db
      .prepare(
        `INSERT INTO fuehrerschein_vorlage (id, dateiname, inhalt, version, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .bind(VORLAGE_ID, dateiname, inhalt.buffer, jetzt, identitaet.email)
      .run();
  } catch {
    // Der Primärschlüssel ist fest ('fuehrerscheinliste'); ein Fehlschlag
    // hier bedeutet, dass zwischen Vorabprüfung und INSERT bereits eine
    // Vorlage angelegt wurde.
    return fehlerAntwort(
      'FUEHRERSCHEIN_VORLAGE_KONFLIKT',
      'Es liegt bereits eine Vorlage vor. Bitte neu laden.',
      412,
    );
  }
  return jsonAntwort(
    { vorhanden: true, dateiname, version: 1, geaendertAm: jetzt, geaendertVon: identitaet.email },
    201,
    { ETag: starkesEtag(1) },
  );
}

export async function verarbeiteFuehrerscheinVorlage(
  anfrage: Request,
  umgebung: FuehrerscheinVorlageKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  if (!umgebung.BENUTZER_DB) {
    return fehlerAntwort(
      'FUEHRERSCHEIN_VORLAGE_NICHT_EINGERICHTET',
      'Die Führerschein-Vorlagenablage ist am Server noch nicht eingerichtet.',
      503,
    );
  }
  const db = umgebung.BENUTZER_DB;
  const pfad = new URL(anfrage.url).pathname;

  if (pfad === FUEHRERSCHEIN_VORLAGE_DATEI_PFAD) {
    if (anfrage.method !== 'GET') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }
    try {
      return await leseDatei(db);
    } catch (ursache) {
      console.error('FUEHRERSCHEIN_VORLAGE_DB_FEHLER', ursachenText(ursache));
      return fehlerAntwort(
        'FUEHRERSCHEIN_VORLAGE_SPEICHER_FEHLER',
        'Die Vorlage ist nicht lesbar.',
        502,
      );
    }
  }

  try {
    if (anfrage.method === 'GET') return await leseMetadaten(db);
    if (anfrage.method === 'PUT') return await schreibeVorlage(anfrage, db, identitaet);
  } catch (ursache) {
    console.error('FUEHRERSCHEIN_VORLAGE_DB_FEHLER', ursachenText(ursache));
    return fehlerAntwort(
      'FUEHRERSCHEIN_VORLAGE_SPEICHER_FEHLER',
      'Die Vorlage konnte nicht gespeichert werden.',
      502,
    );
  }
  return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
    Allow: 'GET, PUT',
  });
}
