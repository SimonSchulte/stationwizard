/**
 * Domänenmodell des Preiskatalogs. Kennt ausschließlich eigene Typen – kein
 * Datenbank-, ETag- oder HTTP-Bezug, analog zu `fahrzeuge/models/fahrzeug.model.ts`.
 */

export type PreiskatalogArt = 'einsatzkraft' | 'fahrzeug';

export const PREISKATALOG_ARTEN: readonly PreiskatalogArt[] = ['einsatzkraft', 'fahrzeug'];

export interface PreiskatalogEintrag {
  id: string;
  bezeichnung: string;
  art: PreiskatalogArt;
  /** Cent. Stundensatz bei 'einsatzkraft', Pauschale je Schicht/Tag bei 'fahrzeug'. */
  einzelpreisCent: number;
  geaendertAm: string;
  geaendertVon: string;
  /**
   * Anders als bei Fahrzeugen liegt die Version hier direkt im JSON-Feld
   * jeder Zeile statt nur im ETag der Einzelabfrage: bei vielen kleinen,
   * inline editierbaren Zeilen wäre ein Ladevorgang je Zeile vor jeder
   * Änderung ein Verstoß gegen die Sparsamkeitsregel.
   */
  version: number;
}
