import { fehlerAntwort, jsonAntwort } from './antwort';
import {
  lesePruefeKoerper,
  protokolliereAenderung,
  type FahrzeugeKonfiguration,
  type GeprueftesBenutzerkonto,
} from './fahrzeuge';
import { istObjekt } from './json-lesen';
import { freigabeGruppen, leseRolle, pruefeFreigabeRecht } from './rollen';

/**
 * Freigabe öffentlicher Kilometermeldungen.
 *
 * Eine Meldung aus `oeffentliche-erfassung.ts` liegt in
 * `ablesung_einreichungen` und ist noch kein Kilometerstand. Erst die Freigabe
 * durch eine geprüfte Identität erzeugt daraus eine Zeile in `ablesungen` –
 * und damit den Wert, der in Jahresbilanz und Kilometerstandsbericht einfließt.
 *
 * Eigenes Modul statt weiteren Wachstums von `fahrzeuge.ts` (dort schon über
 * 900 Zeilen). In `index.ts` vor dem `/api/fahrzeuge`-Zweig eingehängt, aus
 * demselben Grund wie der Kilometerstandsbericht: die UUID-Pfade dort wiesen
 * `einreichungen` sonst als unbekannt ab.
 */

const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const EINREICHUNGEN_PFAD = '/api/fahrzeuge/einreichungen';
const FREIGABE_PFAD = new RegExp(`^/api/fahrzeuge/einreichungen/(${UUID_MUSTER})/freigabe$`, 'i');
const ABLEHNUNG_PFAD = new RegExp(`^/api/fahrzeuge/einreichungen/(${UUID_MUSTER})/ablehnung$`, 'i');

const KOERPER_GRENZE = 4 * 1024;
const GRUND_MAX = 200;

interface EinreichungZeile {
  id: string;
  fahrzeug_id: string;
  abgelesen_am: string;
  stand: number;
  eingereicht_am: string;
  eingereicht_von_name: string;
  bemerkung: string;
  bezeichnung: string;
  kennzeichen: string;
  gruppe: string;
  letzter_stand: number | null;
  letzter_stand_am: string | null;
}

function zuEinreichungJson(zeile: EinreichungZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    fahrzeugId: zeile.fahrzeug_id,
    bezeichnung: zeile.bezeichnung,
    kennzeichen: zeile.kennzeichen,
    gruppe: zeile.gruppe,
    abgelesenAm: zeile.abgelesen_am,
    stand: zeile.stand,
    eingereichtAm: zeile.eingereicht_am,
    gemeldetVonName: zeile.eingereicht_von_name,
    bemerkung: zeile.bemerkung,
    letzterStand: zeile.letzter_stand,
    letzterStandAm: zeile.letzter_stand_am,
  };
}

/**
 * Letzter gültiger Stand eines Fahrzeugs, unter Ausschluss korrigierter
 * Ablesungen. Dieselbe Regel steht in `fahrzeug-detail.ts` und in
 * `worker/src/km-bericht.ts`; alle drei sind gemeinsam zu ändern.
 */
const LETZTER_STAND = `
  SELECT a.stand FROM ablesungen a
   WHERE a.fahrzeug_id = e.fahrzeug_id
     AND a.id NOT IN (SELECT korrigiert FROM ablesungen WHERE korrigiert IS NOT NULL)
   ORDER BY a.abgelesen_am DESC, a.erfasst_am DESC LIMIT 1`;

const LETZTER_STAND_AM = `
  SELECT a.abgelesen_am FROM ablesungen a
   WHERE a.fahrzeug_id = e.fahrzeug_id
     AND a.id NOT IN (SELECT korrigiert FROM ablesungen WHERE korrigiert IS NOT NULL)
   ORDER BY a.abgelesen_am DESC, a.erfasst_am DESC LIMIT 1`;

export async function verarbeiteEinreichungen(
  anfrage: Request,
  umgebung: FahrzeugeKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const db = umgebung.FAHRZEUGE_DB;
  if (!db) {
    return fehlerAntwort(
      'FAHRZEUGE_KONFIGURATION_FEHLT',
      'Das Fahrzeugmodul ist noch nicht eingerichtet.',
      503,
    );
  }

  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('FAHRZEUGE_PFAD_UNGUELTIG', 'Fahrzeuge-Endpunkt nicht gefunden.', 404);
  }

  try {
    if (url.pathname === EINREICHUNGEN_PFAD) {
      if (anfrage.method === 'GET') return await listeEinreichungen(db, umgebung, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    const freizugeben = FREIGABE_PFAD.exec(url.pathname)?.[1];
    if (freizugeben) {
      if (anfrage.method === 'POST') return await gibFrei(db, umgebung, freizugeben, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'POST',
      });
    }

    const abzulehnen = ABLEHNUNG_PFAD.exec(url.pathname)?.[1];
    if (abzulehnen) {
      if (anfrage.method === 'POST')
        return await lehneAb(anfrage, db, umgebung, abzulehnen, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'POST',
      });
    }

    return fehlerAntwort('FAHRZEUGE_PFAD_UNGUELTIG', 'Fahrzeuge-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('FAHRZEUGE_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'FAHRZEUGE_DB_FEHLER',
      'Die Einreichungen konnten nicht verarbeitet werden.',
      502,
    );
  }
}

/**
 * Offene Einreichungen, serverseitig auf die Gruppen begrenzt, für die die
 * aufrufende Person freigeben darf.
 *
 * Ohne passende Rolle eine leere Liste statt 403: „Offene Aufgaben" soll für
 * jeden aufrufbar und dann ehrlich leer sein. Damit stimmt zugleich die Zahl
 * in der Navigation ohne Zusatzlogik.
 */
async function listeEinreichungen(
  db: D1Database,
  umgebung: FahrzeugeKonfiguration,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const benutzerDb = umgebung.BENUTZER_DB;
  if (!benutzerDb) {
    return fehlerAntwort(
      'ROLLEN_KONFIGURATION_FEHLT',
      'Die Rollenverwaltung ist noch nicht eingerichtet.',
      503,
    );
  }
  const zuordnung = await leseRolle(benutzerDb, identitaet.email);
  const gruppen = freigabeGruppen(zuordnung?.rolle ?? null);
  if (gruppen.length === 0) {
    return jsonAntwort({ einreichungen: [] });
  }
  const platzhalter = gruppen.map(() => '?').join(', ');
  const ergebnis = await db
    .prepare(
      `SELECT e.id, e.fahrzeug_id, e.abgelesen_am, e.stand, e.eingereicht_am,
              e.eingereicht_von_name, e.bemerkung,
              f.bezeichnung, f.kennzeichen, f.gruppe,
              (${LETZTER_STAND}) AS letzter_stand,
              (${LETZTER_STAND_AM}) AS letzter_stand_am
         FROM ablesung_einreichungen e
         JOIN fahrzeuge f ON f.id = e.fahrzeug_id
        WHERE e.status = 'offen' AND f.gruppe IN (${platzhalter})
        ORDER BY e.eingereicht_am ASC`,
    )
    .bind(...gruppen)
    .all<EinreichungZeile>();
  return jsonAntwort({ einreichungen: ergebnis.results.map(zuEinreichungJson) });
}

interface OffeneEinreichung {
  id: string;
  fahrzeug_id: string;
  abgelesen_am: string;
  stand: number;
  eingereicht_von_name: string;
  bemerkung: string;
  status: string;
  gruppe: string;
}

async function ladeOffene(db: D1Database, id: string): Promise<OffeneEinreichung | null> {
  return db
    .prepare(
      `SELECT e.id, e.fahrzeug_id, e.abgelesen_am, e.stand, e.eingereicht_von_name,
              e.bemerkung, e.status, f.gruppe
         FROM ablesung_einreichungen e
         JOIN fahrzeuge f ON f.id = e.fahrzeug_id
        WHERE e.id = ?`,
    )
    .bind(id)
    .first<OffeneEinreichung>();
}

/** Meldename in einem Protokolleintrag, klar als Selbstauskunft kenntlich. */
function gemeldetVon(name: string): string {
  return `gemeldet von „${name}" (Selbstauskunft)`;
}

async function gibFrei(
  db: D1Database,
  umgebung: FahrzeugeKonfiguration,
  id: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const einreichung = await ladeOffene(db, id);
  if (!einreichung) {
    return fehlerAntwort('EINREICHUNG_NICHT_GEFUNDEN', 'Meldung nicht gefunden.', 404);
  }
  const verweigert = await pruefeFreigabeRecht(umgebung, identitaet, einreichung.gruppe);
  if (verweigert) return verweigert;

  const ablesungId = crypto.randomUUID();
  const jetzt = new Date().toISOString();

  // Wächter: nur wenn diese Anweisung tatsächlich eine Zeile ändert, war die
  // Meldung noch offen. Zwei gleichzeitig Freigebende erzeugen so keine zweite
  // Ablesung; die zweite Anfrage bekommt 409.
  const gesetzt = await db
    .prepare(
      `UPDATE ablesung_einreichungen
          SET status = 'freigegeben', entschieden_am = ?, entschieden_von = ?, ablesung_id = ?
        WHERE id = ? AND status = 'offen'`,
    )
    .bind(jetzt, identitaet.email, ablesungId, id)
    .run();
  if (gesetzt.meta.changes === 0) {
    return fehlerAntwort(
      'EINREICHUNG_NICHT_OFFEN',
      'Diese Meldung wurde bereits entschieden.',
      409,
    );
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO ablesungen
           (id, fahrzeug_id, abgelesen_am, stand, erfasst_am, erfasst_von, quelle,
            korrigiert, bemerkung, gemeldet_von_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ablesungId,
        einreichung.fahrzeug_id,
        einreichung.abgelesen_am,
        einreichung.stand,
        jetzt,
        // Die geprüfte Identität der freigebenden Person. `erfasstVon` bleibt
        // damit projektweit eine geprüfte Access-E-Mail; der ungeprüfte
        // Meldename steht daneben in `gemeldet_von_name`.
        identitaet.email,
        // Als Parameter statt als SQL-Literal, damit dieser INSERT dieselbe
        // Form hat wie der in `fahrzeuge.ts`. Der Wert stammt hier aus dem
        // Code, nie aus einer Eingabe – `pruefeAblesungEingabe()` lässt ihn
        // ausdrücklich nicht zu.
        'oeffentlich',
        null,
        einreichung.bemerkung,
        einreichung.eingereicht_von_name,
      ),
    db
      .prepare(
        `INSERT INTO fahrzeug_aenderungen (id, fahrzeug_id, zeitpunkt, von, beschreibung)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        einreichung.fahrzeug_id,
        jetzt,
        identitaet.email,
        `Öffentliche Kilometermeldung freigegeben: ${einreichung.stand} km am ` +
          `${einreichung.abgelesen_am}, ${gemeldetVon(einreichung.eingereicht_von_name)}`,
      ),
  ]);

  return jsonAntwort({
    einreichung: {
      id,
      status: 'freigegeben',
      entschiedenAm: jetzt,
      entschiedenVon: identitaet.email,
      ablesungId,
    },
    ablesung: {
      id: ablesungId,
      fahrzeugId: einreichung.fahrzeug_id,
      abgelesenAm: einreichung.abgelesen_am,
      stand: einreichung.stand,
      erfasstAm: jetzt,
      erfasstVon: identitaet.email,
      quelle: 'oeffentlich',
      korrigiert: null,
      bemerkung: einreichung.bemerkung,
      gemeldetVonName: einreichung.eingereicht_von_name,
    },
  });
}

async function lehneAb(
  anfrage: Request,
  db: D1Database,
  umgebung: FahrzeugeKonfiguration,
  id: string,
  identitaet: GeprueftesBenutzerkonto,
): Promise<Response> {
  const koerper = await lesePruefeKoerper(anfrage, KOERPER_GRENZE);
  if (koerper instanceof Response) return koerper;
  const inhalt = koerper.inhalt;
  const rohGrund = istObjekt(inhalt) ? inhalt['grund'] : undefined;
  if (rohGrund !== undefined && typeof rohGrund !== 'string') {
    return fehlerAntwort('FAHRZEUGE_DATEI_UNGUELTIG', 'Ungültiger Ablehnungsgrund.', 400);
  }
  const grund = (rohGrund ?? '').trim().slice(0, GRUND_MAX);

  const einreichung = await ladeOffene(db, id);
  if (!einreichung) {
    return fehlerAntwort('EINREICHUNG_NICHT_GEFUNDEN', 'Meldung nicht gefunden.', 404);
  }
  const verweigert = await pruefeFreigabeRecht(umgebung, identitaet, einreichung.gruppe);
  if (verweigert) return verweigert;

  const jetzt = new Date().toISOString();
  const gesetzt = await db
    .prepare(
      `UPDATE ablesung_einreichungen
          SET status = 'abgelehnt', entschieden_am = ?, entschieden_von = ?, ablehnungsgrund = ?
        WHERE id = ? AND status = 'offen'`,
    )
    .bind(jetzt, identitaet.email, grund, id)
    .run();
  if (gesetzt.meta.changes === 0) {
    return fehlerAntwort(
      'EINREICHUNG_NICHT_OFFEN',
      'Diese Meldung wurde bereits entschieden.',
      409,
    );
  }

  // Der Grund ist der einzige Freitextanteil eines Protokolleintrags im
  // Projekt; er steht deshalb in Klammern und ist als Zitat kenntlich.
  await protokolliereAenderung(
    db,
    einreichung.fahrzeug_id,
    identitaet.email,
    `Öffentliche Kilometermeldung abgelehnt: ${einreichung.stand} km am ` +
      `${einreichung.abgelesen_am}, ${gemeldetVon(einreichung.eingereicht_von_name)}` +
      (grund ? ` (Grund: „${grund}")` : ''),
  );

  return jsonAntwort({
    einreichung: {
      id,
      status: 'abgelehnt',
      entschiedenAm: jetzt,
      entschiedenVon: identitaet.email,
      ablehnungsgrund: grund,
    },
  });
}
