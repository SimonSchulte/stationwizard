import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { blobZuArrayBuffer, Groessenfehler, leseBegrenzt } from './binaer-lesen';
import { ursachenText } from './diagnose';
import { starkesEtag, versionAusEtag } from './etag';

/**
 * Gemeinsame Ablage einer einzelnen hinterlegten Dokumentvorlage, die der Client füllt: die
 * Word-Vorlage der Führerscheinliste (`fuehrerschein-vorlage.ts`, Migration 0012) und das
 * PDF-Formular des Ehrungsantrags (`ehrungsantrag-vorlage.ts`, Migration 0018). Der Worker liest
 * oder schreibt dabei nie in die Datei hinein, er verwahrt sie nur. Genau eine Zeile mit fester
 * `id` je Tabelle; Ersetzen nur mit `If-Match`, Neuanlage nur mit `If-None-Match: *`.
 */
export interface DateiVorlageKonfiguration {
  BENUTZER_DB?: D1Database;
}

export interface VorlagenArt {
  /** Fester Tabellenname aus der Migration, nie aus einer Eingabe. */
  tabelle: 'fuehrerschein_vorlage' | 'ehrungsantrag_vorlage';
  id: string;
  pfad: string;
  dateiPfad: string;
  inhaltstyp: string;
  /** Kein Pfadtrenner, kein Anführungszeichen (Content-Disposition), keine Steuerzeichen. */
  dateinameMuster: RegExp;
  pruefeInhalt(inhalt: Uint8Array): boolean;
  /** Präfix der festen Fehlercodes, etwa `FUEHRERSCHEIN_VORLAGE`. */
  code: string;
  /** Für den Text bei fehlender Einrichtung. */
  bezeichnung: string;
}

/** Großzügig für ein einseitiges Formular, aber begrenzt gegen das Tageskontingent. */
const VORLAGE_GRENZE = 5 * 1024 * 1024;

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

async function leseMetadaten(art: VorlagenArt, db: D1Database): Promise<Response> {
  const zeile = await db
    .prepare(
      `SELECT dateiname, version, geaendert_am, geaendert_von FROM ${art.tabelle} WHERE id = ?`,
    )
    .bind(art.id)
    .first<VorlageMetaZeile>();
  return jsonAntwort(metadatenJson(zeile), 200, zeile ? { ETag: starkesEtag(zeile.version) } : {});
}

async function leseDatei(art: VorlagenArt, db: D1Database): Promise<Response> {
  const zeile = await db
    .prepare(`SELECT dateiname, inhalt, version FROM ${art.tabelle} WHERE id = ?`)
    .bind(art.id)
    .first<{ dateiname: string; inhalt: ArrayBuffer | number[]; version: number }>();
  if (!zeile) {
    return fehlerAntwort(`${art.code}_NICHT_GEFUNDEN`, 'Keine Vorlage hinterlegt.', 404);
  }
  return new Response(blobZuArrayBuffer(zeile.inhalt), {
    status: 200,
    headers: {
      'Content-Type': art.inhaltstyp,
      'Content-Disposition': `attachment; filename="${zeile.dateiname}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ETag: starkesEtag(zeile.version),
    },
  });
}

async function schreibeVorlage(
  art: VorlagenArt,
  anfrage: Request,
  db: D1Database,
  identitaet: Benutzer,
): Promise<Response> {
  const beiUebereinstimmung = anfrage.headers.get('If-Match');
  const beiNichtvorhandensein = anfrage.headers.get('If-None-Match');
  if (!beiUebereinstimmung && !beiNichtvorhandensein) {
    return fehlerAntwort(
      `${art.code}_VORBEDINGUNG_FEHLT`,
      'Zum Speichern zuerst laden oder eine neue Vorlage ausdrücklich anlegen.',
      428,
    );
  }
  if (beiUebereinstimmung && beiNichtvorhandensein) {
    return fehlerAntwort(`${art.code}_VORBEDINGUNG_UNGUELTIG`, 'Ungültige Version.', 400);
  }
  let erwarteteVersion: number | null = null;
  if (beiUebereinstimmung) {
    erwarteteVersion = versionAusEtag(beiUebereinstimmung);
    if (erwarteteVersion === null) {
      return fehlerAntwort(`${art.code}_VORBEDINGUNG_UNGUELTIG`, 'Ungültige Version.', 400);
    }
  } else if (beiNichtvorhandensein !== '*') {
    return fehlerAntwort(`${art.code}_VORBEDINGUNG_UNGUELTIG`, 'Ungültige Version.', 400);
  }

  const dateiname = anfrage.headers.get('X-Stationwizard-Dateiname');
  if (!dateiname || !art.dateinameMuster.test(dateiname)) {
    return fehlerAntwort(`${art.code}_DATEINAME_UNGUELTIG`, 'Ungültiger Dateiname.', 400);
  }

  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== art.inhaltstyp && inhaltstyp !== 'application/octet-stream') {
    return fehlerAntwort(`${art.code}_INHALTSTYP_UNGUELTIG`, 'Unzulässiger Dateityp.', 415);
  }

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 30_000);
  let inhalt: Uint8Array<ArrayBuffer>;
  try {
    inhalt = await leseBegrenzt(anfrage, VORLAGE_GRENZE, abbruch.signal);
  } catch (fehler) {
    if (abbruch.signal.aborted) {
      return fehlerAntwort(
        `${art.code}_UPLOAD_ZEITLIMIT`,
        'Die Datei wurde nicht rechtzeitig übertragen.',
        408,
      );
    }
    return fehlerAntwort(
      fehler instanceof Groessenfehler ? `${art.code}_ZU_GROSS` : `${art.code}_UNLESBAR`,
      fehler instanceof Groessenfehler ? 'Die Datei ist zu groß.' : 'Die Datei ist nicht lesbar.',
      fehler instanceof Groessenfehler ? 413 : 400,
    );
  } finally {
    clearTimeout(zeitlimit);
  }
  if (!art.pruefeInhalt(inhalt)) {
    return fehlerAntwort(`${art.code}_UNGUELTIG`, 'Ungültiger Dateiinhalt.', 400);
  }

  const jetzt = new Date().toISOString();

  if (erwarteteVersion !== null) {
    const ergebnis = await db
      .prepare(
        `UPDATE ${art.tabelle}
         SET dateiname = ?, inhalt = ?, geaendert_am = ?, geaendert_von = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind(dateiname, inhalt.buffer, jetzt, identitaet.email, art.id, erwarteteVersion)
      .run();
    if (ergebnis.meta.changes === 0) {
      return fehlerAntwort(
        `${art.code}_KONFLIKT`,
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
        `INSERT INTO ${art.tabelle} (id, dateiname, inhalt, version, geaendert_am, geaendert_von)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .bind(art.id, dateiname, inhalt.buffer, jetzt, identitaet.email)
      .run();
  } catch {
    // Der Primärschlüssel ist fest (`art.id`); ein Fehlschlag
    // hier bedeutet, dass zwischen Vorabprüfung und INSERT bereits eine
    // Vorlage angelegt wurde.
    return fehlerAntwort(
      `${art.code}_KONFLIKT`,
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

export async function verarbeiteDateiVorlage(
  art: VorlagenArt,
  anfrage: Request,
  umgebung: DateiVorlageKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  if (!umgebung.BENUTZER_DB) {
    return fehlerAntwort(
      `${art.code}_NICHT_EINGERICHTET`,
      `Die Ablage der ${art.bezeichnung} ist am Server noch nicht eingerichtet.`,
      503,
    );
  }
  const db = umgebung.BENUTZER_DB;
  const pfad = new URL(anfrage.url).pathname;

  if (pfad === art.dateiPfad) {
    if (anfrage.method !== 'GET') {
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }
    try {
      return await leseDatei(art, db);
    } catch (ursache) {
      console.error(`${art.code}_DB_FEHLER`, ursachenText(ursache));
      return fehlerAntwort(`${art.code}_SPEICHER_FEHLER`, 'Die Vorlage ist nicht lesbar.', 502);
    }
  }

  try {
    if (anfrage.method === 'GET') return await leseMetadaten(art, db);
    if (anfrage.method === 'PUT') return await schreibeVorlage(art, anfrage, db, identitaet);
  } catch (ursache) {
    console.error(`${art.code}_DB_FEHLER`, ursachenText(ursache));
    return fehlerAntwort(
      `${art.code}_SPEICHER_FEHLER`,
      'Die Vorlage konnte nicht gespeichert werden.',
      502,
    );
  }
  return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
    Allow: 'GET, PUT',
  });
}
