import { leseJsonKoerper } from './json-lesen';
import { type RollenKonfiguration } from './rollen';

/**
 * Gemeinsame Konfiguration, Grenzen und Körperlesen der Fahrzeug-Endpunkte. Die Ressourcen
 * liegen in `fahrzeuge-stammdaten.ts`, `fahrzeuge-ablesungen.ts`,
 * `fahrzeuge-erfassungslinks.ts` und `fahrzeuge-kurzlink.ts`; `fahrzeuge.ts` verteilt nur.
 */

/**
 * Braucht neben der Fahrzeugdatenbank auch die Benutzerdatenbank: die
 * Erfassungslink-Endpunkte prüfen die Rolle serverseitig, und Rollen liegen in
 * einer getrennten D1-Datenbank (kein JOIN möglich, siehe `rollen.ts`).
 */
export interface FahrzeugeKonfiguration extends RollenKonfiguration {
  FAHRZEUGE_DB?: D1Database;
}

/** Ausschließlich die vom Worker geprüfte Access-Identität, nie ein Client-Feld. */
export interface GeprueftesBenutzerkonto {
  email: string;
}
// Stammdaten mit Wartungsterminen bleiben klein; großzügige, aber feste Grenze
// gegen Missbrauch. Ablesungen sind noch kleiner.
export const FAHRZEUG_KOERPER_GRENZE = 64 * 1024;
export const ABLESUNG_KOERPER_GRENZE = 4 * 1024;
/**
 * Exportiert für `einreichungen.ts`: dieselben Grenzen und dieselbe
 * Fehlerklassifikation für jeden Fahrzeug-Schreibendpunkt.
 */
export function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  return leseJsonKoerper(anfrage, grenze, {
    inhaltstyp: 'FAHRZEUGE_INHALTSTYP_UNGUELTIG',
    zuGross: 'FAHRZEUGE_DATEI_ZU_GROSS',
    unlesbar: 'FAHRZEUGE_DATEI_UNLESBAR',
  });
}
