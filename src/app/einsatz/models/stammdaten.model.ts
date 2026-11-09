/**
 * Stammdaten der Packeinheiten, Stufe 1 (Konzept `docs/konzept-packeinheiten.md`): Lager mit
 * Reihenfolge (Laufweg) und der Artikelkatalog mit Heimatlager. Die Version liegt je Zeile im JSON,
 * weil die Zeilen inline bearbeitet werden (wie beim Preiskatalog).
 */

/** Feste Mengeneinheiten eines Artikels; gemeinsam mit `worker/src/einsatzplanung-stammdaten.ts` ändern. */
export const ARTIKEL_EINHEITEN = [
  'Stück',
  'Liter',
  'Packung',
  'Kiste',
  'Flasche',
  'Rolle',
  'Satz',
  'Paar',
  'Meter',
  'Kilogramm',
] as const;

export type ArtikelEinheit = (typeof ARTIKEL_EINHEITEN)[number];

/** Grenzen laut Vertrag; der Worker prüft dieselben Werte. */
export const STAMMDATEN_GRENZEN = { lager: 100, artikel: 2000, name: 100 } as const;

export interface Lager {
  id: string;
  name: string;
  /** Position im Laufweg, ab 1. */
  reihenfolge: number;
  version: number;
  geaendertAm: string;
  geaendertVon: string;
}

export interface Artikel {
  id: string;
  name: string;
  einheit: ArtikelEinheit;
  /** Heimatlager; `null`, solange keines gewählt ist. */
  lagerId: string | null;
  version: number;
  geaendertAm: string;
  geaendertVon: string;
}

export interface LagerEingabe {
  id: string;
  name: string;
}

export interface ArtikelEingabe {
  id: string;
  name: string;
  einheit: ArtikelEinheit;
  lagerId: string | null;
}
