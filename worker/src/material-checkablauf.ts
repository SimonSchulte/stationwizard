import { type Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istNichtleererText, istObjekt, UUID_REGEX } from './json-lesen';
import { berlinerKalendertag } from './kalender';
import { type BehaelterZeile, zuBehaelterJson } from './material-behaelter';
import {
  type EntwurfFehler,
  pruefeEntwurf,
  pruefePositionen,
  VorlagenFach,
  zaehleKennzahlen,
} from './material-check';
import {
  CHECK_KOERPER_GRENZE,
  istKurztext,
  lesePruefeKoerper,
  TEXT_MAX,
} from './material-gemeinsam';

/** Fahrzeugcheck: Prüfauftrag, Zwischenstand (Entwurf), Checkhistorie und Anlage. */

export interface CheckZeile {
  id: string;
  behaelter_id: string;
  vorlage_id: string;
  vorlage_version: number;
  vorlage_bezeichnung: string;
  grundlage: string;
  geprueft_am: string;
  erfasst_am: string;
  erfasst_von: string;
  gemeldet_von_name: string | null;
  quelle: string;
  verfallsdatum_erfasst: number;
  bemerkung: string;
  positionen: string;
  positionen_gesamt: number;
  positionen_geprueft: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
}

/** Kopfdaten ohne `positionen`: die Historie zeigt den Inhalt nie. */
function zuCheckKopfJson(zeile: CheckZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    behaelterId: zeile.behaelter_id,
    vorlageId: zeile.vorlage_id,
    vorlageBezeichnung: zeile.vorlage_bezeichnung,
    geprueftAm: zeile.geprueft_am,
    erfasstAm: zeile.erfasst_am,
    erfasstVon: zeile.erfasst_von,
    gemeldetVonName: zeile.gemeldet_von_name,
    quelle: zeile.quelle,
    verfallsdatumErfasst: zeile.verfallsdatum_erfasst === 1,
    bemerkung: zeile.bemerkung,
    positionenGesamt: zeile.positionen_gesamt,
    positionenGeprueft: zeile.positionen_geprueft,
    fehlmengen: zeile.fehlmengen,
    unbrauchbar: zeile.unbrauchbar,
    abgelaufen: zeile.abgelaufen,
  };
}

function zuCheckJson(zeile: CheckZeile): Record<string, unknown> {
  return {
    ...zuCheckKopfJson(zeile),
    grundlage: zeile.grundlage,
    vorlageVersion: zeile.vorlage_version,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    positionen: JSON.parse(zeile.positionen),
  };
}

interface BehaelterMitVorlageZeile extends BehaelterZeile {
  fahrzeug_bezeichnung: string;
  fahrzeug_funkrufname: string;
  fahrzeug_gruppe: string;
  vorlage_bezeichnung: string;
  vorlage_grundlage: string;
  vorlage_inhalt: string;
  vorlage_version: number;
}

const BEHAELTER_MIT_VORLAGE = `
  SELECT b.*, f.bezeichnung AS fahrzeug_bezeichnung, f.funkrufname AS fahrzeug_funkrufname,
         f.gruppe AS fahrzeug_gruppe, v.bezeichnung AS vorlage_bezeichnung,
         v.grundlage AS vorlage_grundlage, v.inhalt AS vorlage_inhalt,
         v.version AS vorlage_version
  FROM behaelter b
  JOIN fahrzeuge f ON f.id = b.fahrzeug_id
  JOIN pruefvorlagen v ON v.id = b.vorlage_id
  WHERE b.id = ?`;

async function ladeBehaelterMitVorlage(
  db: D1Database,
  behaelterId: string,
): Promise<BehaelterMitVorlageZeile | null> {
  return db.prepare(BEHAELTER_MIT_VORLAGE).bind(behaelterId).first<BehaelterMitVorlageZeile>();
}

/**
 * Alles, was die Prüfseite braucht, in **einem** Aufruf: Behälter, Fahrzeug und
 * die vollständige Vorlage. Zwei getrennte Abrufe wären zwei Worker-Anfragen
 * gegen das Tageskontingent, für Daten, die immer zusammen gebraucht werden.
 */
export async function lesePruefauftrag(
  db: D1Database,
  behaelterId: string,
  identitaet: Benutzer,
): Promise<Response> {
  const zeile = await ladeBehaelterMitVorlage(db, behaelterId);
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  // Der eigene Zwischenstand reist mit: ein zweiter Abruf wäre eine weitere
  // Worker-Anfrage gegen das Tageskontingent. `inhaber` ist die geprüfte
  // E-Mail, der Stand einer anderen Person ist über keinen Weg lesbar.
  const entwurfZeile = await db
    .prepare(
      `SELECT inhalt, gespeichert_am FROM check_entwuerfe
        WHERE behaelter_id = ? AND inhaber = ?`,
    )
    .bind(behaelterId, identitaet.email)
    .first<EntwurfZeile>();
  return jsonAntwort({
    entwurf: entwurfZeile
      ? {
          gespeichertAm: entwurfZeile.gespeichert_am,
          // `behaelterId` steht nicht in der Spalte: sie ist der Schlüssel der
          // Zeile. Ergänzt wird sie hier, damit die Antwort unmittelbar den
          // `Checkstand` der Oberfläche ergibt.
          stand: { behaelterId, ...JSON.parse(entwurfZeile.inhalt) },
        }
      : null,
    behaelter: {
      ...zuBehaelterJson(zeile),
      fahrzeugBezeichnung: zeile.fahrzeug_bezeichnung,
      fahrzeugFunkrufname: zeile.fahrzeug_funkrufname,
      fahrzeugGruppe: zeile.fahrzeug_gruppe,
    },
    vorlage: {
      id: zeile.vorlage_id,
      bezeichnung: zeile.vorlage_bezeichnung,
      grundlage: zeile.vorlage_grundlage,
      version: zeile.vorlage_version,
      faecher: JSON.parse(zeile.vorlage_inhalt),
    },
  });
}

interface EntwurfZeile {
  inhalt: string;
  gespeichert_am: string;
}

const ENTWURF_KOERPER_GRENZE = 256 * 1024;

const ENTWURF_FEHLERTEXT: Readonly<Record<EntwurfFehler, string>> = {
  unlesbar: 'Der Zwischenstand ist unlesbar.',
  'unbekannter-artikel': 'Der Zwischenstand nennt einen Artikel, den die Prüfvorlage nicht hat.',
  'stueckzahl-passt-nicht': 'Die Verfallsdaten passen nicht zur Sollmenge eines Artikels.',
};

/**
 * Speichert den Zwischenstand eines laufenden Checks – ausdrücklich, nie
 * automatisch: ein Schreibvorgang je Änderung liefe gegen das Tageskontingent.
 *
 * Zusammengesetzter Schlüssel aus Behälter und `inhaber`, jedes Speichern ein
 * `INSERT … ON CONFLICT DO UPDATE`. So gibt es je Person und Behälter genau
 * eine Zeile, und niemand kann beliebig viele anlegen. `inhaber` ist
 * ausschließlich die geprüfte E-Mail, nie eine Angabe aus dem Anfragekörper.
 *
 * Es gibt diesen Weg bewusst **nur** im angemeldeten Bereich. Auf der
 * öffentlichen Checkseite wäre `inhaber` leer, der Zwischenstand also je
 * Behälter geteilt und für jeden Scan des Aufklebers les- und überschreibbar;
 * dort bleibt es beim Entwurf auf dem Gerät.
 */
export async function speichereEntwurf(
  anfrage: Request,
  db: D1Database,
  behaelterId: string,
  identitaet: Benutzer,
): Promise<Response> {
  const zeile = await ladeBehaelterMitVorlage(db, behaelterId);
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  const koerper = await lesePruefeKoerper(anfrage, ENTWURF_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;

  const faecher: VorlagenFach[] = JSON.parse(zeile.vorlage_inhalt);
  const geprueft = pruefeEntwurf(koerper.inhalt, faecher);
  if ('fehler' in geprueft) {
    return fehlerAntwort('MATERIAL_ENTWURF_UNGUELTIG', ENTWURF_FEHLERTEXT[geprueft.fehler], 400);
  }

  const gespeichertAm = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO check_entwuerfe
         (behaelter_id, inhaber, inhalt, gespeichert_am, gespeichert_von_name)
       VALUES (?, ?, ?, ?, '')
       ON CONFLICT (behaelter_id, inhaber)
       DO UPDATE SET inhalt = excluded.inhalt, gespeichert_am = excluded.gespeichert_am`,
    )
    .bind(behaelterId, identitaet.email, JSON.stringify(geprueft.entwurf), gespeichertAm)
    .run();

  return jsonAntwort({ gespeichertAm });
}

/**
 * Verwirft den eigenen Zwischenstand. Antwortet immer 204, auch wenn nichts da
 * war: Löschen ist idempotent, und ein 404 wäre hier nur ein Orakel darüber,
 * ob jemand einen Entwurf hatte.
 */
export async function loescheEntwurf(
  db: D1Database,
  behaelterId: string,
  identitaet: Benutzer,
): Promise<Response> {
  await db
    .prepare('DELETE FROM check_entwuerfe WHERE behaelter_id = ? AND inhaber = ?')
    .bind(behaelterId, identitaet.email)
    .run();
  return new Response(null, { status: 204 });
}

export async function listeChecks(db: D1Database, behaelterId: string): Promise<Response> {
  const ergebnis = await db
    .prepare(
      `SELECT * FROM materialchecks WHERE behaelter_id = ?
       ORDER BY geprueft_am DESC, erfasst_am DESC`,
    )
    .bind(behaelterId)
    .all<CheckZeile>();
  return jsonAntwort({ checks: ergebnis.results.map(zuCheckKopfJson) });
}

export async function leseCheck(db: D1Database, id: string): Promise<Response> {
  const zeile = await db
    .prepare('SELECT * FROM materialchecks WHERE id = ?')
    .bind(id)
    .first<CheckZeile>();
  if (!zeile) {
    return fehlerAntwort('MATERIAL_CHECK_NICHT_GEFUNDEN', 'Check nicht gefunden.', 404);
  }
  return jsonAntwort(zuCheckJson(zeile));
}

const POSITIONEN_FEHLERTEXT: Readonly<Record<string, string>> = {
  unlesbar: 'Die Positionen sind nicht lesbar.',
  'unbekannter-artikel': 'Der Check enthält einen Artikel, den die Prüfvorlage nicht kennt.',
  'artikel-doppelt': 'Ein Artikel kommt im Check mehrfach vor.',
  'artikel-fehlt': 'Der Check deckt nicht alle Artikel der Prüfvorlage ab.',
  'stueckzahl-passt-nicht': 'Die Zahl der Verfallsdaten passt nicht zur Sollmenge.',
};

/**
 * Nimmt einen Check entgegen. Der Vorgang ist **ein** Schreibvorgang: alle
 * Positionen liegen als JSON in einer Zeile, die Kennzahlen daneben in eigenen
 * Spalten. Eine Zeile je Position wären gut hundert Schreibvorgänge je Prüfung
 * gegen das Tageskontingent des kostenlosen Tarifs.
 */
export async function legeCheckAn(
  anfrage: Request,
  db: D1Database,
  behaelterId: string,
  identitaet: Benutzer,
): Promise<Response> {
  if (anfrage.headers.get('If-None-Match') !== '*') {
    return fehlerAntwort(
      'MATERIAL_VORBEDINGUNG_FEHLT',
      'Zum Anlegen ausdrücklich If-None-Match: * senden.',
      428,
    );
  }
  const zeile = await ladeBehaelterMitVorlage(db, behaelterId);
  if (!zeile) {
    return fehlerAntwort('MATERIAL_BEHAELTER_NICHT_GEFUNDEN', 'Behälter nicht gefunden.', 404);
  }
  const koerper = await lesePruefeKoerper(anfrage, CHECK_KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const inhalt = koerper.inhalt;
  if (
    !istObjekt(inhalt) ||
    !istNichtleererText(inhalt['id']) ||
    !UUID_REGEX.test(inhalt['id']) ||
    typeof inhalt['verfallsdatumErfasst'] !== 'boolean' ||
    !istKurztext(inhalt['bemerkung'], TEXT_MAX)
  ) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültiger Check.', 400);
  }

  const faecher: VorlagenFach[] = JSON.parse(zeile.vorlage_inhalt);
  const geprueft = pruefePositionen(inhalt['positionen'], faecher);
  if ('fehler' in geprueft) {
    return fehlerAntwort(
      'MATERIAL_CHECK_POSITIONEN_UNGUELTIG',
      POSITIONEN_FEHLERTEXT[geprueft.fehler] ?? 'Ungültige Positionen.',
      400,
    );
  }

  const jetzt = new Date();
  // Berliner Kalendertag, serverseitig: die Seite hat bewusst kein Datumsfeld.
  const geprueftAm = berlinerKalendertag(jetzt);
  const kennzahlen = zaehleKennzahlen(geprueft.positionen, geprueftAm);
  if (kennzahlen.geprueft === 0) {
    return fehlerAntwort(
      'MATERIAL_CHECK_OHNE_PRUEFUNG',
      'Ein Check ohne eine einzige geprüfte Position ist kein Nachweis.',
      400,
    );
  }

  const erfasstAm = jetzt.toISOString();
  // Zusammen mit dem Check verschwindet der eigene Zwischenstand: sonst käme er
  // beim nächsten Öffnen des Behälters wieder hoch, obwohl er erledigt ist.
  await db.batch([
    db
      .prepare(
        `INSERT INTO materialchecks
         (id, behaelter_id, vorlage_id, vorlage_version, vorlage_bezeichnung, grundlage,
          geprueft_am, erfasst_am, erfasst_von, gemeldet_von_name, quelle,
          verfallsdatum_erfasst, bemerkung, positionen, positionen_gesamt,
          positionen_geprueft, fehlmengen, unbrauchbar, abgelaufen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'angemeldet', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        inhalt['id'],
        behaelterId,
        zeile.vorlage_id,
        zeile.vorlage_version,
        zeile.vorlage_bezeichnung,
        zeile.vorlage_grundlage,
        geprueftAm,
        erfasstAm,
        // Immer die geprüfte Identität, nie eine Angabe aus dem Anfragekörper.
        identitaet.email,
        inhalt['verfallsdatumErfasst'] ? 1 : 0,
        inhalt['bemerkung'],
        JSON.stringify(geprueft.positionen),
        kennzahlen.gesamt,
        kennzahlen.geprueft,
        kennzahlen.fehlmengen,
        kennzahlen.unbrauchbar,
        kennzahlen.abgelaufen,
      ),
    db
      .prepare('DELETE FROM check_entwuerfe WHERE behaelter_id = ? AND inhaber = ?')
      .bind(behaelterId, identitaet.email),
  ]);

  return jsonAntwort(
    {
      id: inhalt['id'],
      behaelterId,
      vorlageId: zeile.vorlage_id,
      vorlageVersion: zeile.vorlage_version,
      vorlageBezeichnung: zeile.vorlage_bezeichnung,
      grundlage: zeile.vorlage_grundlage,
      geprueftAm,
      erfasstAm,
      erfasstVon: identitaet.email,
      gemeldetVonName: null,
      quelle: 'angemeldet',
      verfallsdatumErfasst: inhalt['verfallsdatumErfasst'],
      bemerkung: inhalt['bemerkung'],
      positionen: geprueft.positionen,
      positionenGesamt: kennzahlen.gesamt,
      positionenGeprueft: kennzahlen.geprueft,
      fehlmengen: kennzahlen.fehlmengen,
      unbrauchbar: kennzahlen.unbrauchbar,
      abgelaufen: kennzahlen.abgelaufen,
    },
    201,
  );
}
