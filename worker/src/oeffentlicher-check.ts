import { fehlerAntwort, jsonAntwort } from './antwort';
import { ERFASSUNG_TOKEN_MUSTER, gleichInKonstanterZeit } from './erfassung-token';
import { istObjekt, istText, leseJsonBegrenzt } from './json-lesen';
import { berlinerKalendertag } from './kalender';
import { VorlagenFach, pruefePositionen, zaehleKennzahlen } from './material-check';
import { SCHUTZ_HEADER, pruefeUrsprung } from './oeffentliche-erfassung';

/**
 * Öffentlicher Fahrzeugcheck – der zweite Weg am Zugangsschutz vorbei, nach
 * demselben Muster wie die Kilometermeldung.
 *
 * Eng gefasst, und zwar genauso:
 *
 * - Zwei feste Pfadmuster, in `oeffentliche-erfassung.ts` aufgezählt und dort
 *   durch einen Anzahltest gesichert.
 * - Jede Fachanfrage braucht ein unerratbares Token je **Behälter**.
 * - Preisgegeben werden nur Behälter- und Fahrzeugbezeichnung, Funkrufname und
 *   die Soll-Liste. Nicht: UUIDs, Kennzeichen, Gruppe, frühere Checks oder der
 *   Zeitpunkt der letzten Prüfung – der letzte Stand legte die Nutzung offen.
 * - Eine Meldung wird nie von selbst ein Check. Sie landet in
 *   `check_einreichungen` und wird erst durch die Freigabe einer geprüften
 *   Identität zu einer Zeile in `materialchecks`.
 *
 * Weder Access noch die Ursprungsprüfung aus `index.ts` sind hier vorgelaufen;
 * beide Schutzwirkungen erbringt dieses Modul selbst.
 */
export interface OeffentlicherCheckKonfiguration {
  FAHRZEUGE_DB?: D1Database;
}

/**
 * Deutlich größer als die 2 kB der Kilometermeldung: ein Check trägt gut
 * hundert Positionen mit Verfallsdaten je Stück und liegt bei etwa 35 kB.
 * Gegengewicht sind die behälterbezogenen Mengenbremsen unten und die Prüfung
 * gegen die gespeicherte Vorlage – ein Körper mit unbekannten Artikel-Ids wird
 * verworfen, bevor irgendetwas geschrieben wird.
 */
const KOERPER_GRENZE = 256 * 1024;
const NAME_MIN = 2;
const NAME_MAX = 60;
const BEMERKUNG_MAX = 200;

/**
 * Obergrenzen als Missbrauchsbremse, ohne zusätzlichen Speicher. Bewusst
 * behälterbezogen und nicht IP-bezogen: eine IP-Speicherung wäre eine neue
 * personenbezogene Verarbeitung ohne fachlichen Auftrag. Strenger als bei der
 * Kilometermeldung, weil ein Check ein Vielfaches an Bytes kostet.
 */
const MAX_OFFENE_JE_BEHAELTER = 3;
const WIEDERHOLFENSTER_MS = 300_000;

/** Eine einzige Antwort für ungültiges, unbekanntes und gelöschtes – kein Orakel. */
function unbekannt(): Response {
  return fehlerAntwort(
    'CHECK_UNBEKANNT',
    'Dieser QR-Code gehört zu keinem Behälter.',
    404,
    SCHUTZ_HEADER,
  );
}

function nichtEingerichtet(): Response {
  return fehlerAntwort(
    'CHECK_KONFIGURATION_FEHLT',
    'Der Fahrzeugcheck ist noch nicht eingerichtet.',
    503,
    SCHUTZ_HEADER,
  );
}

interface BehaelterZeile {
  id: string;
  bezeichnung: string;
  check_token: string;
  fahrzeug_bezeichnung: string;
  fahrzeug_funkrufname: string;
  vorlage_id: string;
  vorlage_version: number;
  vorlage_bezeichnung: string;
  vorlage_grundlage: string;
  vorlage_inhalt: string;
}

/**
 * Sucht über den eindeutigen Index und vergleicht danach **noch einmal** in
 * konstanter Zeit – der Indexzugriff allein ließe über die Laufzeit Rückschlüsse
 * auf Teiltreffer zu.
 */
async function findeBehaelter(db: D1Database, token: string): Promise<BehaelterZeile | null> {
  if (!ERFASSUNG_TOKEN_MUSTER.test(token)) return null;
  const zeile = await db
    .prepare(
      `SELECT b.id, b.bezeichnung, b.check_token,
              f.bezeichnung AS fahrzeug_bezeichnung, f.funkrufname AS fahrzeug_funkrufname,
              v.id AS vorlage_id, v.version AS vorlage_version,
              v.bezeichnung AS vorlage_bezeichnung, v.grundlage AS vorlage_grundlage,
              v.inhalt AS vorlage_inhalt
         FROM behaelter b
         JOIN fahrzeuge f ON f.id = b.fahrzeug_id
         JOIN pruefvorlagen v ON v.id = b.vorlage_id
        WHERE b.check_token = ?`,
    )
    .bind(token)
    .first<BehaelterZeile>();
  if (!zeile) return null;
  return gleichInKonstanterZeit(zeile.check_token, token) ? zeile : null;
}

/** Steuerzeichen entfernen; die Eingabe stammt von einer ungeprüften Quelle. */
function saeubere(wert: string): string {
  let sauber = '';
  for (const zeichen of wert) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) sauber += zeichen;
  }
  return sauber.trim();
}

async function leseBehaelter(db: D1Database, token: string): Promise<Response> {
  const zeile = await findeBehaelter(db, token);
  if (!zeile) return unbekannt();
  return jsonAntwort(
    {
      behaelterBezeichnung: zeile.bezeichnung,
      fahrzeugBezeichnung: zeile.fahrzeug_bezeichnung,
      fahrzeugFunkrufname: zeile.fahrzeug_funkrufname,
      vorlage: {
        bezeichnung: zeile.vorlage_bezeichnung,
        // Artikel-Ids müssen mit: die Einreichung bezieht sich darauf. Es sind
        // Vorlagen-Ids, keine Behälter- oder Fahrzeugkennungen.
        faecher: JSON.parse(zeile.vorlage_inhalt),
      },
    },
    200,
    SCHUTZ_HEADER,
  );
}

async function pruefeMengenbremsen(db: D1Database, behaelterId: string): Promise<Response | null> {
  const offene = await db
    .prepare(
      `SELECT count(*) AS anzahl FROM check_einreichungen
        WHERE behaelter_id = ? AND status = 'offen'`,
    )
    .bind(behaelterId)
    .first<{ anzahl: number }>();
  if ((offene?.anzahl ?? 0) >= MAX_OFFENE_JE_BEHAELTER) {
    return fehlerAntwort(
      'CHECK_ZU_VIELE_OFFEN',
      'Für diesen Behälter liegen bereits mehrere Meldungen zur Freigabe vor.',
      429,
      { ...SCHUTZ_HEADER, 'Retry-After': '3600' },
    );
  }
  const letzte = await db
    .prepare(
      `SELECT eingereicht_am FROM check_einreichungen
        WHERE behaelter_id = ? ORDER BY eingereicht_am DESC LIMIT 1`,
    )
    .bind(behaelterId)
    .first<{ eingereicht_am: string }>();
  if (letzte) {
    const abstand = Date.now() - Date.parse(letzte.eingereicht_am);
    if (Number.isFinite(abstand) && abstand >= 0 && abstand < WIEDERHOLFENSTER_MS) {
      return fehlerAntwort(
        'CHECK_ZU_HAEUFIG',
        'Für diesen Behälter wurde gerade eben schon eine Meldung abgegeben.',
        429,
        { ...SCHUTZ_HEADER, 'Retry-After': '300' },
      );
    }
  }
  return null;
}

async function nimmCheckAn(anfrage: Request, db: D1Database, token: string): Promise<Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort(
      'CHECK_INHALTSTYP_UNGUELTIG',
      'Unzulässiger Inhaltstyp.',
      415,
      SCHUTZ_HEADER,
    );
  }
  const zeile = await findeBehaelter(db, token);
  if (!zeile) return unbekannt();

  const abbruch = new AbortController();
  const zeitlimit = setTimeout(() => abbruch.abort(), 15_000);
  let gelesen;
  try {
    gelesen = await leseJsonBegrenzt(anfrage, KOERPER_GRENZE, abbruch.signal);
  } finally {
    clearTimeout(zeitlimit);
  }
  if (!gelesen.erfolg) {
    return gelesen.ursache === 'zu-gross'
      ? fehlerAntwort('CHECK_ZU_GROSS', 'Die Meldung ist zu groß.', 413, SCHUTZ_HEADER)
      : fehlerAntwort(
          'CHECK_EINGABE_UNGUELTIG',
          'Die Meldung ist nicht lesbar.',
          400,
          SCHUTZ_HEADER,
        );
  }

  const inhalt = gelesen.inhalt;
  if (
    !istObjekt(inhalt) ||
    !istText(inhalt['name']) ||
    typeof inhalt['verfallsdatumErfasst'] !== 'boolean'
  ) {
    return fehlerAntwort('CHECK_EINGABE_UNGUELTIG', 'Unvollständige Meldung.', 400, SCHUTZ_HEADER);
  }
  const name = saeubere(inhalt['name']);
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return fehlerAntwort(
      'CHECK_EINGABE_UNGUELTIG',
      'Bitte einen Namen zwischen 2 und 60 Zeichen angeben.',
      400,
      SCHUTZ_HEADER,
    );
  }
  const bemerkungRoh = inhalt['bemerkung'];
  const bemerkung = istText(bemerkungRoh) ? saeubere(bemerkungRoh).slice(0, BEMERKUNG_MAX) : '';

  const faecher: VorlagenFach[] = JSON.parse(zeile.vorlage_inhalt);
  const geprueft = pruefePositionen(inhalt['positionen'], faecher);
  if ('fehler' in geprueft) {
    return fehlerAntwort(
      'CHECK_EINGABE_UNGUELTIG',
      'Die Meldung passt nicht zur hinterlegten Liste.',
      400,
      SCHUTZ_HEADER,
    );
  }

  const geprueftAm = berlinerKalendertag(new Date());
  const kennzahlen = zaehleKennzahlen(geprueft.positionen, geprueftAm);
  if (kennzahlen.geprueft === 0) {
    return fehlerAntwort(
      'CHECK_EINGABE_UNGUELTIG',
      'Bitte mindestens eine Position prüfen.',
      400,
      SCHUTZ_HEADER,
    );
  }

  const bremse = await pruefeMengenbremsen(db, zeile.id);
  if (bremse) return bremse;

  await db
    .prepare(
      `INSERT INTO check_einreichungen
         (id, behaelter_id, vorlage_id, vorlage_version, vorlage_bezeichnung, grundlage,
          geprueft_am, verfallsdatum_erfasst, bemerkung, positionen, positionen_gesamt,
          positionen_geprueft, fehlmengen, unbrauchbar, abgelaufen,
          eingereicht_am, eingereicht_von_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen')`,
    )
    .bind(
      crypto.randomUUID(),
      zeile.id,
      zeile.vorlage_id,
      zeile.vorlage_version,
      zeile.vorlage_bezeichnung,
      zeile.vorlage_grundlage,
      geprueftAm,
      inhalt['verfallsdatumErfasst'] ? 1 : 0,
      bemerkung,
      JSON.stringify(geprueft.positionen),
      kennzahlen.gesamt,
      kennzahlen.geprueft,
      kennzahlen.fehlmengen,
      kennzahlen.unbrauchbar,
      kennzahlen.abgelaufen,
      new Date().toISOString(),
      name,
    )
    .run();

  return jsonAntwort(
    {
      angenommen: true,
      positionenGeprueft: kennzahlen.geprueft,
      positionenGesamt: kennzahlen.gesamt,
      fehlmengen: kennzahlen.fehlmengen,
      unbrauchbar: kennzahlen.unbrauchbar,
      abgelaufen: kennzahlen.abgelaufen,
    },
    201,
    SCHUTZ_HEADER,
  );
}

export async function verarbeiteOeffentlichenCheck(
  anfrage: Request,
  umgebung: OeffentlicherCheckKonfiguration,
  url: URL,
  token: string,
): Promise<Response> {
  // Methode und Ursprung zuerst, noch vor der Konfigurationsprüfung: ein Aufruf
  // von fremder Origin soll nicht einmal erfahren, ob das Modul eingerichtet ist.
  const schreibend = anfrage.method === 'POST';
  if (!schreibend && anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
      ...SCHUTZ_HEADER,
      Allow: 'GET, HEAD, POST',
    });
  }
  if (schreibend) {
    const ursprung = pruefeUrsprung(anfrage, url);
    if (ursprung) return ursprung;
  }

  const db = umgebung.FAHRZEUGE_DB;
  if (!db) return nichtEingerichtet();

  try {
    return schreibend ? await nimmCheckAn(anfrage, db, token) : await leseBehaelter(db, token);
  } catch (ursache) {
    console.error('CHECK_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'CHECK_DB_FEHLER',
      'Die Meldung konnte nicht verarbeitet werden.',
      502,
      SCHUTZ_HEADER,
    );
  }
}
