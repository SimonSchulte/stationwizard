import { Checkstand } from '../models/check.model';

/**
 * Sichert den Zwischenstand eines laufenden Checks auf dem Gerät.
 *
 * Zweite, eng gefasste Ausnahme von der Projektregel "fachlich erforderliche
 * Daten nicht in localStorage persistieren" (CLAUDE.md). Begründung:
 *
 * - Ein Check hat gut hundert Positionen und dauert leicht zwanzig Minuten.
 *   Sperrt das Telefon und verwirft der Browser die Seite, wäre die Arbeit
 *   sonst verloren – in der Praxis der Rückfall aufs Papier.
 * - Gespeichert wird ein **unfertiger Arbeitsstand des Geräteinhabers**. Die
 *   führende Fassung jedes Checks liegt in D1; dieser Eintrag ist nie eine
 *   Quelle für eine Kennzahl und wird beim Einreichen gelöscht.
 * - Jeder Zugriff ist gekapselt, ein sichtbarer Knopf verwirft den Entwurf,
 *   und ein Eintrag älter als `HOECHSTALTER_TAGE` gilt als verfallen.
 *
 * Wer den Stand geräteübergreifend fortsetzen will, speichert ihn ausdrücklich
 * serverseitig; automatisch geschieht das nie, das wäre ein Schreibvorgang je
 * Änderung gegen das Tageskontingent.
 */

const PRAEFIX = 'stationwizard.materialcheck.';
const HOECHSTALTER_TAGE = 7;

interface GespeicherterEntwurf {
  gespeichertAm: string;
  stand: Checkstand;
}

function schluessel(behaelterId: string): string {
  return `${PRAEFIX}${behaelterId}`;
}

function istEntwurf(wert: unknown): wert is GespeicherterEntwurf {
  if (typeof wert !== 'object' || wert === null) return false;
  const eintrag = wert as Record<string, unknown>;
  const stand = eintrag['stand'];
  if (typeof eintrag['gespeichertAm'] !== 'string' || typeof stand !== 'object' || stand === null) {
    return false;
  }
  const inhalt = stand as Record<string, unknown>;
  return (
    typeof inhalt['behaelterId'] === 'string' &&
    typeof inhalt['verfallsdatumErfasst'] === 'boolean' &&
    typeof inhalt['bemerkung'] === 'string' &&
    typeof inhalt['positionen'] === 'object' &&
    inhalt['positionen'] !== null
  );
}

function istVerfallen(gespeichertAm: string): boolean {
  const alter = Date.now() - Date.parse(gespeichertAm);
  return !Number.isFinite(alter) || alter > HOECHSTALTER_TAGE * 86_400_000;
}

export interface EntwurfEintrag {
  gespeichertAm: string;
  stand: Checkstand;
}

/** `null`, wenn es keinen brauchbaren Entwurf gibt – auch bei gesperrtem Speicher. */
export function leseEntwurf(behaelterId: string): EntwurfEintrag | null {
  let roh: string | null;
  try {
    roh = localStorage.getItem(schluessel(behaelterId));
  } catch {
    return null;
  }
  if (roh === null) return null;
  let inhalt: unknown;
  try {
    inhalt = JSON.parse(roh);
  } catch {
    vergissEntwurf(behaelterId);
    return null;
  }
  if (!istEntwurf(inhalt) || istVerfallen(inhalt.gespeichertAm)) {
    vergissEntwurf(behaelterId);
    return null;
  }
  // Ein Entwurf eines anderen Behälters wäre ein Zuordnungsfehler.
  if (inhalt.stand.behaelterId !== behaelterId) {
    vergissEntwurf(behaelterId);
    return null;
  }
  return inhalt;
}

export function merkeEntwurf(stand: Checkstand): void {
  try {
    localStorage.setItem(
      schluessel(stand.behaelterId),
      JSON.stringify({ gespeichertAm: new Date().toISOString(), stand }),
    );
  } catch {
    // Ohne Seitenspeicher entfällt nur die Wiederaufnahme; der Check selbst läuft weiter.
  }
}

export function vergissEntwurf(behaelterId: string): void {
  try {
    localStorage.removeItem(schluessel(behaelterId));
  } catch {
    // Nichts zu vergessen, wenn schon das Lesen nicht möglich war.
  }
}
