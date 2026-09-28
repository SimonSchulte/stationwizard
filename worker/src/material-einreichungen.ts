import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, istText, leseJsonBegrenzt } from './json-lesen';
import { freigabeGruppen, leseRolle, pruefeFreigabeRecht } from './rollen';
import type { RollenKonfiguration } from './rollen';

/**
 * Freigabe und Ablehnung öffentlich eingereichter Fahrzeugchecks.
 *
 * Eine Einreichung wird nie von selbst ein Check. Erst hier entsteht aus ihr
 * eine Zeile in `materialchecks` – mit der **freigebenden** geprüften Identität
 * in `erfasst_von` und dem selbst angegebenen Namen daneben in
 * `gemeldet_von_name`. Die Zusage „`erfasstVon` ist immer eine geprüfte
 * Identität" bleibt damit unangetastet, und `quelle = 'oeffentlich'` entsteht
 * ausschließlich hier.
 *
 * Freigeben darf `zugfuehrung` (alle Gruppen) oder `gruppenfuehrung-<gruppe>`
 * genau der Gruppe des Fahrzeugs, an dem der Behälter hängt (`rollen.ts`).
 */
export interface MaterialEinreichungenKonfiguration extends RollenKonfiguration {
  FAHRZEUGE_DB?: D1Database;
}

const UUID_MUSTER = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_REGEX = new RegExp(`^${UUID_MUSTER}$`, 'i');

export const MATERIAL_EINREICHUNGEN_PFAD = '/api/material/einreichungen';
const FREIGABE_PFAD = '/api/material/einreichungen/freigabe';
const ABLEHNUNG_PFAD = new RegExp(`^/api/material/einreichungen/(${UUID_MUSTER})/ablehnung$`, 'i');

const KOERPER_GRENZE = 8 * 1024;
const GRUND_MAX = 200;
/**
 * Obergrenze einer Stapelfreigabe. Jede Id kostet eigene Abfragen; eine
 * unbegrenzte Liste wäre eine Last, die eine einzelne Anfrage nicht tragen soll.
 */
const MAX_STAPEL = 50;

interface EinreichungZeile {
  id: string;
  behaelter_id: string;
  vorlage_id: string;
  vorlage_version: number;
  vorlage_bezeichnung: string;
  grundlage: string;
  geprueft_am: string;
  verfallsdatum_erfasst: number;
  bemerkung: string;
  positionen: string;
  positionen_gesamt: number;
  positionen_geprueft: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
  eingereicht_am: string;
  eingereicht_von_name: string;
  status: string;
  behaelter_bezeichnung: string;
  fahrzeug_bezeichnung: string;
  fahrzeug_gruppe: string;
}

const EINREICHUNG_AUSWAHL = `
  SELECT e.*, b.bezeichnung AS behaelter_bezeichnung,
         f.bezeichnung AS fahrzeug_bezeichnung, f.gruppe AS fahrzeug_gruppe
  FROM check_einreichungen e
  JOIN behaelter b ON b.id = e.behaelter_id
  JOIN fahrzeuge f ON f.id = b.fahrzeug_id`;

/** Kopfdaten ohne `positionen`: die Liste zeigt den Inhalt nicht. */
function zuEinreichungJson(zeile: EinreichungZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    behaelterId: zeile.behaelter_id,
    behaelterBezeichnung: zeile.behaelter_bezeichnung,
    fahrzeugBezeichnung: zeile.fahrzeug_bezeichnung,
    vorlageBezeichnung: zeile.vorlage_bezeichnung,
    geprueftAm: zeile.geprueft_am,
    eingereichtAm: zeile.eingereicht_am,
    eingereichtVonName: zeile.eingereicht_von_name,
    verfallsdatumErfasst: zeile.verfallsdatum_erfasst === 1,
    bemerkung: zeile.bemerkung,
    positionenGesamt: zeile.positionen_gesamt,
    positionenGeprueft: zeile.positionen_geprueft,
    fehlmengen: zeile.fehlmengen,
    unbrauchbar: zeile.unbrauchbar,
    abgelaufen: zeile.abgelaufen,
  };
}

/**
 * Ohne Rolle eine leere Liste statt 403: „Offene Aufgaben" soll für jede
 * angemeldete Person ehrlich leer sein, nicht mit einem Fehler auffallen.
 */
async function listeEinreichungen(
  db: D1Database,
  umgebung: MaterialEinreichungenKonfiguration,
  identitaet: Benutzer,
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
  if (gruppen.length === 0) return jsonAntwort({ einreichungen: [] });

  const platzhalter = gruppen.map(() => '?').join(', ');
  const ergebnis = await db
    .prepare(
      `${EINREICHUNG_AUSWAHL}
        WHERE e.status = 'offen' AND f.gruppe IN (${platzhalter})
        ORDER BY e.eingereicht_am`,
    )
    .bind(...gruppen)
    .all<EinreichungZeile>();
  return jsonAntwort({ einreichungen: ergebnis.results.map(zuEinreichungJson) });
}

async function ladeEinreichung(db: D1Database, id: string): Promise<EinreichungZeile | null> {
  return db.prepare(`${EINREICHUNG_AUSWAHL} WHERE e.id = ?`).bind(id).first<EinreichungZeile>();
}

/** Vollständige Einreichung samt Positionen, für die Durchsicht vor der Freigabe. */
async function leseEinreichung(db: D1Database, id: string): Promise<Response> {
  const zeile = await ladeEinreichung(db, id);
  if (!zeile) {
    return fehlerAntwort('EINREICHUNG_NICHT_GEFUNDEN', 'Einreichung nicht gefunden.', 404);
  }
  return jsonAntwort({
    ...zuEinreichungJson(zeile),
    status: zeile.status,
    grundlage: zeile.grundlage,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    positionen: JSON.parse(zeile.positionen),
  });
}

type Ergebnis = 'freigegeben' | 'nicht-gefunden' | 'nicht-offen' | 'nicht-erlaubt';

/**
 * Gibt eine einzelne Einreichung frei. Das UPDATE trägt die Bedingung
 * `status = 'offen'` selbst: entscheidet jemand anderes im selben Augenblick,
 * greift es nicht, und es entsteht kein zweiter Check.
 */
async function gibEineFrei(
  db: D1Database,
  umgebung: MaterialEinreichungenKonfiguration,
  id: string,
  identitaet: Benutzer,
): Promise<{ id: string; status: Ergebnis; checkId?: string }> {
  const zeile = await ladeEinreichung(db, id);
  if (!zeile) return { id, status: 'nicht-gefunden' };
  if (zeile.status !== 'offen') return { id, status: 'nicht-offen' };

  const verweigert = await pruefeFreigabeRecht(umgebung, identitaet, zeile.fahrzeug_gruppe);
  if (verweigert) return { id, status: 'nicht-erlaubt' };

  const checkId = crypto.randomUUID();
  const jetzt = new Date().toISOString();
  const entschieden = await db
    .prepare(
      `UPDATE check_einreichungen
          SET status = 'freigegeben', entschieden_am = ?, entschieden_von = ?, check_id = ?
        WHERE id = ? AND status = 'offen'`,
    )
    .bind(jetzt, identitaet.email, checkId, id)
    .run();
  if (entschieden.meta.changes === 0) return { id, status: 'nicht-offen' };

  await db
    .prepare(
      `INSERT INTO materialchecks
         (id, behaelter_id, vorlage_id, vorlage_version, vorlage_bezeichnung, grundlage,
          geprueft_am, erfasst_am, erfasst_von, gemeldet_von_name, quelle,
          verfallsdatum_erfasst, bemerkung, positionen, positionen_gesamt,
          positionen_geprueft, fehlmengen, unbrauchbar, abgelaufen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'oeffentlich', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      checkId,
      zeile.behaelter_id,
      zeile.vorlage_id,
      zeile.vorlage_version,
      zeile.vorlage_bezeichnung,
      zeile.grundlage,
      zeile.geprueft_am,
      jetzt,
      // Die freigebende Person – nicht die meldende.
      identitaet.email,
      zeile.eingereicht_von_name,
      zeile.verfallsdatum_erfasst,
      zeile.bemerkung,
      zeile.positionen,
      zeile.positionen_gesamt,
      zeile.positionen_geprueft,
      zeile.fehlmengen,
      zeile.unbrauchbar,
      zeile.abgelaufen,
    )
    .run();

  return { id, status: 'freigegeben', checkId };
}

/**
 * Stapelfreigabe. Bewusst 200 mit einem Ergebnis je Eintrag statt 207 oder
 * „alles oder nichts": die freigebende Person hat eine Auswahl getroffen, und
 * ein zwischenzeitlich von jemand anderem entschiedener Eintrag darf die
 * übrigen nicht blockieren.
 */
async function gibStapelFrei(
  anfrage: Request,
  db: D1Database,
  umgebung: MaterialEinreichungenKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const koerper = await leseKoerper(anfrage);
  if (koerper instanceof Response) return koerper;
  const ids = koerper['ids'];
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((id) => istText(id) && UUID_REGEX.test(id))
  ) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültige Auswahl.', 400);
  }
  if (ids.length > MAX_STAPEL) {
    return fehlerAntwort(
      'MATERIAL_STAPEL_ZU_GROSS',
      `Es lassen sich höchstens ${MAX_STAPEL} Meldungen auf einmal freigeben.`,
      400,
    );
  }

  const ergebnisse = [];
  for (const id of ids as string[]) {
    ergebnisse.push(await gibEineFrei(db, umgebung, id, identitaet));
  }
  return jsonAntwort({ ergebnisse });
}

/**
 * Ablehnen bleibt einzeln und braucht einen Grund: eine Sammelablehnung ohne
 * individuelle Begründung wäre keine Entscheidung.
 */
async function lehneAb(
  anfrage: Request,
  db: D1Database,
  umgebung: MaterialEinreichungenKonfiguration,
  id: string,
  identitaet: Benutzer,
): Promise<Response> {
  const zeile = await ladeEinreichung(db, id);
  if (!zeile) {
    return fehlerAntwort('EINREICHUNG_NICHT_GEFUNDEN', 'Einreichung nicht gefunden.', 404);
  }
  const verweigert = await pruefeFreigabeRecht(umgebung, identitaet, zeile.fahrzeug_gruppe);
  if (verweigert) return verweigert;

  const koerper = await leseKoerper(anfrage);
  if (koerper instanceof Response) return koerper;
  const grundRoh = koerper['grund'];
  if (!istText(grundRoh) || grundRoh.trim() === '' || grundRoh.length > GRUND_MAX) {
    return fehlerAntwort(
      'MATERIAL_DATEI_UNGUELTIG',
      'Bitte einen Grund für die Ablehnung angeben.',
      400,
    );
  }

  const ergebnis = await db
    .prepare(
      `UPDATE check_einreichungen
          SET status = 'abgelehnt', entschieden_am = ?, entschieden_von = ?, ablehnungsgrund = ?
        WHERE id = ? AND status = 'offen'`,
    )
    .bind(new Date().toISOString(), identitaet.email, grundRoh.trim(), id)
    .run();
  if (ergebnis.meta.changes === 0) {
    return fehlerAntwort(
      'EINREICHUNG_NICHT_OFFEN',
      'Diese Meldung wurde zwischenzeitlich bereits entschieden.',
      409,
    );
  }
  return jsonAntwort({ id, status: 'abgelehnt' });
}

async function leseKoerper(anfrage: Request): Promise<Record<string, unknown> | Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort('MATERIAL_INHALTSTYP_UNGUELTIG', 'Unzulässiger Inhaltstyp.', 415);
  }
  const gelesen = await leseJsonBegrenzt(anfrage, KOERPER_GRENZE);
  if (!gelesen.erfolg) {
    return gelesen.ursache === 'zu-gross'
      ? fehlerAntwort('MATERIAL_DATEI_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
      : fehlerAntwort('MATERIAL_DATEI_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
  }
  if (!istObjekt(gelesen.inhalt)) {
    return fehlerAntwort('MATERIAL_DATEI_UNGUELTIG', 'Ungültige Anfrage.', 400);
  }
  return gelesen.inhalt;
}

const EINZEL_PFAD = new RegExp(`^/api/material/einreichungen/(${UUID_MUSTER})$`, 'i');

export async function verarbeiteMaterialEinreichungen(
  anfrage: Request,
  umgebung: MaterialEinreichungenKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.FAHRZEUGE_DB;
  if (!db) {
    return fehlerAntwort(
      'MATERIAL_KONFIGURATION_FEHLT',
      'Die Materialverwaltung ist noch nicht eingerichtet.',
      503,
    );
  }
  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort('MATERIAL_PFAD_UNGUELTIG', 'Material-Endpunkt nicht gefunden.', 404);
  }

  try {
    // Der feste Freigabepfad steht vor dem UUID-Pfad.
    if (url.pathname === FREIGABE_PFAD) {
      if (anfrage.method === 'POST') return await gibStapelFrei(anfrage, db, umgebung, identitaet);
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

    const einzeln = EINZEL_PFAD.exec(url.pathname)?.[1];
    if (einzeln) {
      if (anfrage.method === 'GET') return await leseEinreichung(db, einzeln);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    if (url.pathname === MATERIAL_EINREICHUNGEN_PFAD) {
      if (anfrage.method === 'GET') return await listeEinreichungen(db, umgebung, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    return fehlerAntwort('MATERIAL_PFAD_UNGUELTIG', 'Material-Endpunkt nicht gefunden.', 404);
  } catch (ursache) {
    console.error('MATERIAL_DB_FEHLER', ursache instanceof Error ? ursache.message : ursache);
    return fehlerAntwort(
      'MATERIAL_DB_FEHLER',
      'Die Meldungen konnten nicht verarbeitet werden.',
      502,
    );
  }
}
