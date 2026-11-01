import { istObjekt, leseJsonKoerper } from './json-lesen';

/**
 * Gemeinsame Bausteine der Ehrungen: feste Schlüssellisten (Gegenstück im Client),
 * Eingabeprüfung, Zeilenform und Körperlesen. Die Endpunkte liegen in
 * `ehrungen-personen.ts`, `ehrungen-import.ts`, `ehrungen-vorgaenge.ts` und
 * `ehrungen-zustaendigkeit.ts`; `ehrungen.ts` verteilt nur.
 */

export interface EhrungenKonfiguration {
  BENUTZER_DB?: D1Database;
}
export const VERLAUF_GRENZE = 200;
/** Feste Liste der Ortsverbände; Gegenstück im Client (`ehrungen.service.ts`). */
export const OV_SCHLUESSEL = ['bielefeld', 'werther'] as const;

/** Feste Schlüsselliste in kanonischer Reihenfolge; Gegenstück im Client. */
export const EHRUNG_SCHLUESSEL = [
  'bronze',
  'silber',
  'gold',
  'jubilaeum-25',
  'jubilaeum-40',
  'jubilaeum-50',
  'jubilaeum-60',
  'uhr-30',
  'uhr-40',
  'uhr-50',
  'ehrenzeichen',
  'ehrenzeichen-bande',
  'ehrennadel',
] as const;

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
export const EINZEL_GRENZE = 4 * 1024;
export const IMPORT_GRENZE = 512 * 1024;
export const IMPORT_MAXIMUM = 1000;
const STUNDEN_MAXIMUM = 1_000_000;

/** Vergleichsform für den Namensabgleich; Gegenstück im Client. */
export function personSchluessel(nachname: string, vorname: string): string {
  const glatt = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${glatt(nachname)}|${glatt(vorname)}`;
}

export function istEchtesDatum(text: string): boolean {
  if (!ISO_DATUM.test(text)) return false;
  const datum = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(datum.getTime()) && datum.toISOString().slice(0, 10) === text;
}

export function wirksameStunden(importiert: number, manuell: number | null): number {
  return Math.max(importiert, manuell ?? 0);
}

export function pruefeStunden(wert: unknown): number | null {
  if (typeof wert !== 'number' || !Number.isFinite(wert) || wert < 0 || wert > STUNDEN_MAXIMUM) {
    return null;
  }
  return Math.round(wert * 100) / 100;
}

/** Jahr der Vergabe; `null` heißt „erhalten, Jahr unbekannt“ (Bestände aus mehreren Aktenlagen). */
export const JAHR_MINIMUM = 1900;
export const JAHR_MAXIMUM = 2200;

export type Erhalten = Partial<Record<(typeof EHRUNG_SCHLUESSEL)[number], number | null>>;

/** Erhaltene Auszeichnungen mit Vergabejahr, in kanonischer Reihenfolge; unbekannte Schlüssel lehnen ab. */
export function pruefeErhalten(wert: unknown): Erhalten | null {
  if (!istObjekt(wert)) return null;
  const bekannt = new Set<string>(EHRUNG_SCHLUESSEL);
  if (Object.keys(wert).some((schluessel) => !bekannt.has(schluessel))) return null;
  const ergebnis: Erhalten = {};
  for (const schluessel of EHRUNG_SCHLUESSEL) {
    if (!Object.hasOwn(wert, schluessel)) continue;
    const jahr = wert[schluessel];
    if (jahr === null) {
      ergebnis[schluessel] = null;
    } else if (
      typeof jahr === 'number' &&
      Number.isInteger(jahr) &&
      jahr >= JAHR_MINIMUM &&
      jahr <= JAHR_MAXIMUM
    ) {
      ergebnis[schluessel] = jahr;
    } else {
      return null;
    }
  }
  return ergebnis;
}

export interface PersonZeile {
  id: string;
  nachname: string;
  vorname: string;
  schluessel: string;
  stunden: number;
  stunden_manuell: number | null;
  stunden_manuell_stand: number | null;
  eintrittsdatum: string | null;
  besondere_verdienste: number;
  erhalten: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

/** Liest die Spalte; die frühere Liste fester Schlüssel (ohne Jahr) wird als „Jahr unbekannt“ gelesen. */
function leseErhaltenSpalte(text: string): Erhalten {
  try {
    const roh: unknown = JSON.parse(text);
    if (Array.isArray(roh)) {
      return pruefeErhalten(Object.fromEntries(roh.map((schluessel) => [schluessel, null]))) ?? {};
    }
    return pruefeErhalten(roh) ?? {};
  } catch {
    return {};
  }
}

export function zuJson(zeile: PersonZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    nachname: zeile.nachname,
    vorname: zeile.vorname,
    // `stunden` ist die wirksame Zahl: die größere von Import und manuellem Nachtrag.
    stunden: wirksameStunden(zeile.stunden, zeile.stunden_manuell),
    stundenImport: zeile.stunden,
    // `?? null`: eine noch nicht angewendete Migration 0015 darf die Liste nicht unlesbar machen.
    stundenManuell: zeile.stunden_manuell ?? null,
    // Dasselbe für 0016: eine fehlende Spalte darf die Liste nicht unlesbar machen.
    stundenManuellStand: zeile.stunden_manuell_stand ?? null,
    eintrittsdatum: zeile.eintrittsdatum,
    besondereVerdienste: zeile.besondere_verdienste === 1,
    erhalten: leseErhaltenSpalte(zeile.erhalten),
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
    // Wie beim Preiskatalog: viele kleine, inline editierte Zeilen, deshalb
    // die Version in der Liste statt eines Einzelabrufs vor jeder Änderung.
    version: zeile.version,
  };
}

export function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  return leseJsonKoerper(anfrage, grenze, {
    zuGross: 'EHRUNGEN_DATEI_ZU_GROSS',
    unlesbar: 'EHRUNGEN_DATEI_UNLESBAR',
  });
}
