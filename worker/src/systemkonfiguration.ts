import type { Benutzer } from './anmeldung';
import { fehlerAntwort, jsonAntwort } from './antwort';
import { istObjekt, leseJsonBegrenzt } from './json-lesen';
import {
  istVersandweg,
  versandwegVerfuegbar,
  VERSANDWEGE,
  type MailVersandKonfiguration,
  type Versandweg,
} from './mail-versand';

/**
 * Betriebseinstellungen, die zur Laufzeit in der Oberfläche gesetzt werden.
 * Ausdrücklich **keine** Zugangsdaten: Absenderadresse und API-Token bleiben
 * Secrets am Worker, weil alles in dieser Tabelle über die API auslesbar ist
 * (siehe `worker/migrations/0005_systemkonfiguration.sql`).
 *
 * Die Tabelle ist ein Schlüssel-Wert-Speicher, der Vertrag ist es nicht:
 * welche Schlüssel es gibt und welche Werte gelten, steht ausschließlich in
 * `EINSTELLUNGEN`. Ein unbekannter Schlüssel wird abgelehnt, nie gespeichert.
 */

export interface SystemkonfigurationKonfiguration extends MailVersandKonfiguration {
  BENUTZER_DB?: D1Database;
}

export const SYSTEMKONFIGURATION_PFAD = '/api/systemkonfiguration';

const KOERPER_GRENZE = 8 * 1024;
const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BETREFF_GRENZE = 120;

export interface Einstellungen {
  /** Empfänger des Kilometerstandsberichts; leer heißt "noch nicht festgelegt". */
  kmBerichtEmpfaenger: string;
  kmBerichtVersandweg: Versandweg;
  kmBerichtBetreff: string;
  /** Ampel-Schwellenwerte der Kilometerübersicht in Monaten Puffer, siehe Frontend-Modell. */
  kmAmpelSchwellenwertGelbMonate: number;
  kmAmpelSchwellenwertRotMonate: number;
}

interface Beschreibung<S extends keyof Einstellungen> {
  /** Spaltenwert in der Tabelle; bewusst stabil und unabhängig vom Feldnamen. */
  schluessel: string;
  standard: Einstellungen[S];
  pruefe(wert: unknown): Einstellungen[S] | null;
}

/**
 * Eine leere Empfängeradresse ist gültig: sie ist der Auslieferungszustand und
 * unterscheidet sich von einer falsch geschriebenen Adresse, die abgelehnt wird.
 */
function pruefeEmpfaenger(wert: unknown): string | null {
  if (typeof wert !== 'string') return null;
  const adresse = wert.trim();
  if (adresse === '') return '';
  if (adresse.length > 254 || !EMAIL_MUSTER.test(adresse)) return null;
  return adresse;
}

/** Steuerzeichen, die in keinem Kopfzeilenwert etwas zu suchen haben. */
function enthaeltSteuerzeichen(wert: string): boolean {
  for (const zeichen of wert) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Der Betreff landet in einem Mailkopf. Zeilenumbrüche und Steuerzeichen sind
 * deshalb verboten – nicht weil die heutigen Versandwege sie durchreichen
 * würden, sondern damit das auch für einen künftigen Adapter gilt, der rohes
 * MIME baut.
 */
function pruefeBetreff(wert: unknown): string | null {
  if (typeof wert !== 'string') return null;
  const betreff = wert.trim();
  if (betreff === '' || betreff.length > BETREFF_GRENZE) return null;
  if (enthaeltSteuerzeichen(betreff)) return null;
  return betreff;
}

/** Obergrenze in Monaten – schon drei Jahre Puffer sind fachlich sinnlos, aber technisch ungefährlich. */
const AMPEL_SCHWELLENWERT_GRENZE = 36;

/**
 * Ganzzahliger Monatswert zwischen 0 und `AMPEL_SCHWELLENWERT_GRENZE`. Anders
 * als die übrigen Felder in Text gespeichert (`wert TEXT`), deshalb hier auch
 * die aus D1 zurückgelesene Zeichenkette annehmen, nicht nur die Zahl aus der
 * Eingabe-JSON.
 */
function pruefeAmpelSchwellenwert(wert: unknown): number | null {
  const zahl = typeof wert === 'number' ? wert : typeof wert === 'string' ? Number(wert) : NaN;
  if (!Number.isInteger(zahl) || zahl < 0 || zahl > AMPEL_SCHWELLENWERT_GRENZE) return null;
  return zahl;
}

const EINSTELLUNGEN: { [S in keyof Einstellungen]: Beschreibung<S> } = {
  kmBerichtEmpfaenger: {
    schluessel: 'km_bericht_empfaenger',
    standard: '',
    pruefe: pruefeEmpfaenger,
  },
  kmBerichtVersandweg: {
    schluessel: 'km_bericht_versandweg',
    standard: 'email-routing',
    pruefe: (wert) => (istVersandweg(wert) ? wert : null),
  },
  kmBerichtBetreff: {
    schluessel: 'km_bericht_betreff',
    standard: 'Kilometerstandsbericht',
    pruefe: pruefeBetreff,
  },
  kmAmpelSchwellenwertGelbMonate: {
    schluessel: 'km_ampel_schwellenwert_gelb_monate',
    standard: 1,
    pruefe: pruefeAmpelSchwellenwert,
  },
  kmAmpelSchwellenwertRotMonate: {
    schluessel: 'km_ampel_schwellenwert_rot_monate',
    standard: 3,
    pruefe: pruefeAmpelSchwellenwert,
  },
};

const FELDER = Object.keys(EINSTELLUNGEN) as (keyof Einstellungen)[];

/**
 * Liest die gespeicherten Werte und ergänzt fehlende durch den Standard. Ein
 * gespeicherter Wert, der heute nicht mehr gültig ist (etwa ein entfallener
 * Versandweg), fällt ebenfalls auf den Standard zurück, statt den Aufrufer mit
 * einem ungültigen Wert zu versorgen.
 */
export async function leseEinstellungen(db: D1Database): Promise<Einstellungen> {
  const ergebnis = await db
    .prepare('SELECT schluessel, wert FROM systemkonfiguration')
    .all<{ schluessel: string; wert: string }>();
  const gespeichert = new Map(ergebnis.results.map((zeile) => [zeile.schluessel, zeile.wert]));

  const einstellungen = {} as Einstellungen;
  for (const feld of FELDER) {
    const beschreibung = EINSTELLUNGEN[feld];
    const roh = gespeichert.get(beschreibung.schluessel);
    const geprueft = roh === undefined ? null : beschreibung.pruefe(roh);
    // Zuweisung über Object.assign, weil TypeScript den Feldtyp über die
    // Schleifenvariable nicht eng genug führt.
    Object.assign(einstellungen, { [feld]: geprueft ?? beschreibung.standard });
  }
  return einstellungen;
}

function pruefeEingabe(wert: unknown): Einstellungen | null {
  if (!istObjekt(wert)) return null;
  const unbekannt = Object.keys(wert).some((schluessel) => !FELDER.includes(schluessel as never));
  if (unbekannt) return null;

  const einstellungen = {} as Einstellungen;
  for (const feld of FELDER) {
    const geprueft = EINSTELLUNGEN[feld].pruefe(wert[feld]);
    if (geprueft === null) return null;
    Object.assign(einstellungen, { [feld]: geprueft });
  }
  return einstellungen;
}

async function antwortMitEinstellungen(
  einstellungen: Einstellungen,
  umgebung: SystemkonfigurationKonfiguration,
): Promise<Response> {
  const versandwege = await Promise.all(
    VERSANDWEGE.map(async (weg) => ({
      weg,
      verfuegbar: await versandwegVerfuegbar(weg, umgebung),
    })),
  );
  return jsonAntwort({ einstellungen, versandwege });
}

/**
 * Feste Systemkonfigurations-Endpunkte hinter der bereits geprüften Anmeldung.
 * Ändern ist vorerst jeder geprüften Identität möglich (siehe Migration 0005,
 * "Rechte vorerst alle, Rollen später").
 */
export async function verarbeiteSystemkonfiguration(
  anfrage: Request,
  umgebung: SystemkonfigurationKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const url = new URL(anfrage.url);
  if (url.pathname !== SYSTEMKONFIGURATION_PFAD || url.search || url.hash) {
    return fehlerAntwort(
      'SYSTEMKONFIGURATION_PFAD_UNGUELTIG',
      'Systemkonfigurations-Endpunkt nicht gefunden.',
      404,
    );
  }
  if (anfrage.method !== 'GET' && anfrage.method !== 'PUT') {
    return fehlerAntwort('METHODE_NICHT_ERLAUBT', 'Methode nicht erlaubt.', 405, {
      Allow: 'GET, PUT',
    });
  }

  const db = umgebung.BENUTZER_DB;
  if (!db) {
    return fehlerAntwort(
      'SYSTEMKONFIGURATION_KONFIGURATION_FEHLT',
      'Die Systemkonfiguration ist noch nicht eingerichtet.',
      503,
    );
  }

  try {
    if (anfrage.method === 'GET') {
      return await antwortMitEinstellungen(await leseEinstellungen(db), umgebung);
    }
    return await speichere(anfrage, db, umgebung, identitaet);
  } catch (ursache) {
    console.error(
      'SYSTEMKONFIGURATION_DB_FEHLER',
      ursache instanceof Error ? ursache.message : ursache,
    );
    return fehlerAntwort(
      'SYSTEMKONFIGURATION_DB_FEHLER',
      'Die Systemkonfiguration konnte nicht verarbeitet werden.',
      502,
    );
  }
}

async function speichere(
  anfrage: Request,
  db: D1Database,
  umgebung: SystemkonfigurationKonfiguration,
  identitaet: Benutzer,
): Promise<Response> {
  const inhaltstyp = anfrage.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (inhaltstyp !== 'application/json') {
    return fehlerAntwort(
      'SYSTEMKONFIGURATION_INHALTSTYP_UNGUELTIG',
      'Unzulässiger Inhaltstyp.',
      415,
    );
  }
  const gelesen = await leseJsonBegrenzt(anfrage, KOERPER_GRENZE);
  if (!gelesen.erfolg) {
    return gelesen.ursache === 'zu-gross'
      ? fehlerAntwort('SYSTEMKONFIGURATION_DATEI_ZU_GROSS', 'Die Anfrage ist zu groß.', 413)
      : fehlerAntwort('SYSTEMKONFIGURATION_DATEI_UNLESBAR', 'Die Anfrage ist nicht lesbar.', 400);
  }
  const eingabe = pruefeEingabe(gelesen.inhalt);
  if (!eingabe) {
    return fehlerAntwort('SYSTEMKONFIGURATION_DATEI_UNGUELTIG', 'Ungültige Einstellungen.', 400);
  }

  const jetzt = new Date().toISOString();
  // Gemeinsam schreiben: ein halb übernommener Satz Einstellungen wäre ein
  // Zustand, den niemand eingestellt hat.
  await db.batch(
    FELDER.map((feld) =>
      db
        .prepare(
          `INSERT INTO systemkonfiguration (schluessel, wert, geaendert_am, geaendert_von)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(schluessel) DO UPDATE SET
             wert = excluded.wert,
             geaendert_am = excluded.geaendert_am,
             geaendert_von = excluded.geaendert_von`,
        )
        .bind(EINSTELLUNGEN[feld].schluessel, eingabe[feld], jetzt, identitaet.email),
    ),
  );

  return antwortMitEinstellungen(eingabe, umgebung);
}
