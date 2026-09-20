import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, istText, leseJsonBegrenzt } from './json-lesen';

export interface BenutzerverwaltungKonfiguration {
  BENUTZER_DB?: D1Database;
}

/**
 * Fachliche Hauptrolle, höchstens eine je Person. Ohne fachlichen Nachweis
 * werden hier keine weiteren Werte ergänzt und keine Reihenfolge verändert
 * (siehe CLAUDE.md, Abschnitt "Dateiformate und Fachverträge" zu
 * `TAKTISCH_ORDER`/`MEDIZINISCH_ORDER` als Beispiel für dieselbe Regel).
 */
const ROLLEN = new Set([
  'zugfuehrung',
  'gruppenfuehrung-sanitaet',
  'gruppenfuehrung-betreuung',
  'gruppenfuehrung-tesi',
  'gruppenfuehrung-verpflegung',
  'gruppenfuehrung-fuehrung',
  'helfer',
]);

/**
 * Zusatzrollen neben der Hauptrolle, unabhängig kombinierbar: "verwaltungshelfer"
 * schaltet den Verwaltungsbereich frei, "sanitaetsdienste" die Einsatzplanung
 * (PEP). Als Menge angelegt, damit künftige weitere Sonderrollen ohne
 * Schemaänderung dazukommen. Die Hauptrolle "zugfuehrung" schließt beide ein,
 * unabhängig davon, ob sie hier zusätzlich gesetzt sind (siehe
 * `src/app/benutzerverwaltung/models/benutzerkonto.model.ts`) – eine künftige
 * Berechtigungsprüfung muss das berücksichtigen.
 */
const SONDERROLLEN = new Set(['verwaltungshelfer', 'sanitaetsdienste']);

const BENUTZERVERWALTUNG_LISTE_PFAD = '/api/benutzerverwaltung';
const BENUTZERVERWALTUNG_EINTRAG_PFAD = /^\/api\/benutzerverwaltung\/([^/]+)$/;
const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOERPER_GRENZE = 4 * 1024;

interface BenutzerZeile {
  email: string;
  rolle: string | null;
  sonderrollen: string;
  erster_zugriff_am: string;
  letzter_zugriff_am: string;
  rolle_geaendert_am: string | null;
  rolle_geaendert_von: string | null;
}

function zuBenutzerJson(zeile: BenutzerZeile): Record<string, unknown> {
  return {
    email: zeile.email,
    rolle: zeile.rolle,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    sonderrollen: JSON.parse(zeile.sonderrollen),
    ersterZugriffAm: zeile.erster_zugriff_am,
    letzterZugriffAm: zeile.letzter_zugriff_am,
    rolleGeaendertAm: zeile.rolle_geaendert_am,
    rolleGeaendertVon: zeile.rolle_geaendert_von,
  };
}

interface RolleEingabe {
  rolle: string | null;
  sonderrollen: string[];
}

function pruefeRolleEingabe(wert: unknown): RolleEingabe | null {
  if (!istObjekt(wert)) return null;
  const rolle = wert['rolle'];
  if (rolle !== null && !(istText(rolle) && ROLLEN.has(rolle))) return null;
  const sonderrollen = wert['sonderrollen'];
  if (
    !Array.isArray(sonderrollen) ||
    !sonderrollen.every((eintrag) => istText(eintrag) && SONDERROLLEN.has(eintrag))
  ) {
    return null;
  }
  const eindeutig = [...new Set(sonderrollen as string[])];
  if (eindeutig.length !== sonderrollen.length) return null;
  return { rolle, sonderrollen: eindeutig };
}

/**
 * Merkt eine geprüfte Anmeldung vor: legt die Zeile beim ersten Zugriff an
 * und aktualisiert sonst nur `letzter_zugriff_am`. Wird best-effort aus
 * `index.ts` bei jedem `/api/benutzer`-Abruf aufgerufen (die Shell ruft ihn
 * einmal je Sitzungsstart auf) - ein Fehler hier darf die eigentliche
 * Antwort nicht verhindern.
 *
 * Die `WHERE`-Bedingung am Konfliktzweig schreibt höchstens einmal je Person
 * und Kalendertag: mehrere Sitzungsstarts am selben Tag ändern den Wert
 * ohnehin nicht sichtbar, verbrauchen aber sonst jedes Mal eine D1-Schreibung.
 * Fachlich bleibt "letzter Zugriff" damit tagesgenau - feiner war die Angabe
 * nie gemeint (siehe CLAUDE.md, Benutzerverwaltung).
 */
export async function registriereZugriff(db: D1Database, email: string): Promise<void> {
  const jetzt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO benutzer (email, sonderrollen, erster_zugriff_am, letzter_zugriff_am)
       VALUES (?, '[]', ?, ?)
       ON CONFLICT(email) DO UPDATE SET letzter_zugriff_am = excluded.letzter_zugriff_am
         WHERE substr(benutzer.letzter_zugriff_am, 1, 10) < substr(excluded.letzter_zugriff_am, 1, 10)`,
    )
    .bind(email, jetzt, jetzt)
    .run();
}

/**
 * Feste Benutzerverwaltungs-Endpunkte hinter der bereits geprüften Anmeldung.
 * Rollenvergabe ist vorerst jeder geprüften Identität möglich (siehe
 * Migration 0004, "Rechte vorerst alle, Rollen später").
 */
export async function verarbeiteBenutzerverwaltung(
  anfrage: Request,
  umgebung: BenutzerverwaltungKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const db = umgebung.BENUTZER_DB;
  if (!db) {
    return fehlerAntwort(
      'BENUTZERVERWALTUNG_KONFIGURATION_FEHLT',
      'Die Benutzerverwaltung ist noch nicht eingerichtet.',
      503,
    );
  }

  const url = new URL(anfrage.url);
  if (url.search || url.hash) {
    return fehlerAntwort(
      'BENUTZERVERWALTUNG_PFAD_UNGUELTIG',
      'Benutzerverwaltungs-Endpunkt nicht gefunden.',
      404,
    );
  }

  try {
    if (url.pathname === BENUTZERVERWALTUNG_LISTE_PFAD) {
      if (anfrage.method === 'GET') return await listeBenutzer(db);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'GET',
      });
    }

    const rohEmail = BENUTZERVERWALTUNG_EINTRAG_PFAD.exec(url.pathname)?.[1];
    if (rohEmail) {
      const email = decodeURIComponent(rohEmail);
      if (!EMAIL_MUSTER.test(email)) {
        return fehlerAntwort(
          'BENUTZERVERWALTUNG_PFAD_UNGUELTIG',
          'Benutzerverwaltungs-Endpunkt nicht gefunden.',
          404,
        );
      }
      if (anfrage.method === 'PUT') return await rolleSetzen(anfrage, db, email, identitaet);
      return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
        Allow: 'PUT',
      });
    }

    return fehlerAntwort(
      'BENUTZERVERWALTUNG_PFAD_UNGUELTIG',
      'Benutzerverwaltungs-Endpunkt nicht gefunden.',
      404,
    );
  } catch (ursache) {
    console.error(
      'BENUTZERVERWALTUNG_DB_FEHLER',
      ursache instanceof Error ? ursache.message : ursache,
    );
    return fehlerAntwort(
      'BENUTZERVERWALTUNG_DB_FEHLER',
      'Die Benutzerdaten konnten nicht verarbeitet werden.',
      502,
    );
  }
}

async function listeBenutzer(db: D1Database): Promise<Response> {
  const ergebnis = await db.prepare('SELECT * FROM benutzer ORDER BY email').all<BenutzerZeile>();
  return jsonAntwort({ benutzer: ergebnis.results.map(zuBenutzerJson) });
}

async function rolleSetzen(
  anfrage: Request,
  db: D1Database,
  email: string,
  identitaet: Benutzer,
): Promise<Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort(
      'BENUTZERVERWALTUNG_INHALTSTYP_UNGUELTIG',
      'Unzulässiger Inhaltstyp.',
      415,
    );
  }
  const ergebnis = await leseJsonBegrenzt(anfrage, KOERPER_GRENZE);
  if (!ergebnis.erfolg) {
    return ergebnis.ursache === 'zu-gross'
      ? fehlerAntwort('BENUTZERVERWALTUNG_DATEI_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
      : fehlerAntwort('BENUTZERVERWALTUNG_DATEI_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
  }
  const eingabe = pruefeRolleEingabe(ergebnis.inhalt);
  if (!eingabe) {
    return fehlerAntwort('BENUTZERVERWALTUNG_DATEI_UNGUELTIG', 'Ungültige Rollendaten.', 400);
  }

  const vorhanden = await db
    .prepare('SELECT email FROM benutzer WHERE email = ?')
    .bind(email)
    .first<{ email: string }>();
  if (!vorhanden) {
    return fehlerAntwort(
      'BENUTZER_NICHT_GEFUNDEN',
      'Diese Person hat sich noch nicht angemeldet.',
      404,
    );
  }

  const jetzt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE benutzer
       SET rolle = ?, sonderrollen = ?, rolle_geaendert_am = ?, rolle_geaendert_von = ?
       WHERE email = ?`,
    )
    .bind(eingabe.rolle, JSON.stringify(eingabe.sonderrollen), jetzt, identitaet.email, email)
    .run();

  const zeile = await db
    .prepare('SELECT * FROM benutzer WHERE email = ?')
    .bind(email)
    .first<BenutzerZeile>();
  // Direkt nach dem eigenen UPDATE, ohne Versionskonflikt möglich.
  return jsonAntwort(zuBenutzerJson(zeile as BenutzerZeile));
}
