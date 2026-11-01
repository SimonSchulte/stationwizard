import { leseJsonKoerper } from './json-lesen';

/** Gemeinsame Konfiguration, Formate und Körperlesen des Angebotswesens. */

export interface AngebotswesenKonfiguration {
  ANGEBOTSWESEN_DB?: D1Database;
}
export const PREISKATALOG_ARTEN = new Set(['einsatzkraft', 'fahrzeug']);
export const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_MUSTER = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Preiskatalog-Einträge sind klein; Angebote können mehrere Schichten mit
// mehreren Positionen enthalten, bleiben aber weit unter Excel-Größenordnung.
export const PREISKATALOG_KOERPER_GRENZE = 4 * 1024;
export const ANGEBOT_KOERPER_GRENZE = 128 * 1024;

export function zeitAlsMinuten(zeit: string): number | null {
  const treffer = HHMM_MUSTER.exec(zeit);
  if (!treffer) return null;
  return Number(treffer[1]) * 60 + Number(treffer[2]);
}
export function lesePruefeKoerper(
  anfrage: Request,
  grenze: number,
): Promise<{ inhalt: unknown } | Response> {
  return leseJsonKoerper(anfrage, grenze, {
    inhaltstyp: 'ANGEBOTSWESEN_INHALTSTYP_UNGUELTIG',
    zuGross: 'ANGEBOTSWESEN_DATEI_ZU_GROSS',
    unlesbar: 'ANGEBOTSWESEN_DATEI_UNLESBAR',
  });
}
