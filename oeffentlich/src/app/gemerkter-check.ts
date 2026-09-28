import { Checkstand } from '../../../src/app/material/models/check.model';

/**
 * Sichert den Zwischenstand eines laufenden Checks auf dem Gerät.
 *
 * Zweite aufgezählte Ausnahme von der `localStorage`-Regel (CLAUDE.md), hier
 * in der Fassung für die öffentliche Seite. Ein Check hat gut hundert
 * Positionen; sperrt das Telefon und verwirft der Browser die Seite, wäre die
 * Arbeit sonst verloren – in der Praxis der Rückfall aufs Papier. Gespeichert
 * wird ein unfertiger Arbeitsstand, nie eine Quelle für eine Kennzahl: die
 * führende Fassung jeder Meldung liegt in D1.
 *
 * Der Schlüssel hängt am Token, weil die öffentliche Seite keine Behälter-Id
 * kennt und auch keine kennen soll.
 */
const PRAEFIX = 'stationwizard.check.entwurf.';
const HOECHSTALTER_STUNDEN = 24;

interface GespeicherterEntwurf {
  gespeichertAm: string;
  stand: Checkstand;
}

function schluessel(token: string): string {
  return `${PRAEFIX}${token}`;
}

export function leseCheckEntwurf(token: string): GespeicherterEntwurf | null {
  let roh: string | null;
  try {
    roh = localStorage.getItem(schluessel(token));
  } catch {
    return null;
  }
  if (roh === null) return null;
  let inhalt: unknown;
  try {
    inhalt = JSON.parse(roh);
  } catch {
    vergissCheckEntwurf(token);
    return null;
  }
  if (typeof inhalt !== 'object' || inhalt === null) return null;
  const eintrag = inhalt as Record<string, unknown>;
  const stand = eintrag['stand'];
  if (typeof eintrag['gespeichertAm'] !== 'string' || typeof stand !== 'object' || stand === null) {
    vergissCheckEntwurf(token);
    return null;
  }
  const alter = Date.now() - Date.parse(eintrag['gespeichertAm']);
  if (!Number.isFinite(alter) || alter > HOECHSTALTER_STUNDEN * 3_600_000) {
    vergissCheckEntwurf(token);
    return null;
  }
  return { gespeichertAm: eintrag['gespeichertAm'], stand: stand as Checkstand };
}

export function merkeCheckEntwurf(token: string, stand: Checkstand): void {
  try {
    localStorage.setItem(
      schluessel(token),
      JSON.stringify({ gespeichertAm: new Date().toISOString(), stand }),
    );
  } catch {
    // Ohne Seitenspeicher entfällt nur die Wiederaufnahme; der Check läuft weiter.
  }
}

export function vergissCheckEntwurf(token: string): void {
  try {
    localStorage.removeItem(schluessel(token));
  } catch {
    // Nichts zu vergessen, wenn schon das Lesen nicht möglich war.
  }
}
