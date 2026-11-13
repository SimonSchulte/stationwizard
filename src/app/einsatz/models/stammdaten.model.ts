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
export const STAMMDATEN_GRENZEN = {
  lager: 100,
  plaetze: 40,
  platzName: 60,
  artikel: 2000,
  kisten: 300,
  kistenPositionen: 100,
  name: 100,
  bemerkung: 200,
  mengeMax: 1_000_000,
} as const;

/** Ein Platz innerhalb eines Lagers, z. B. „Regal“ oder „Spinde“. */
export interface Platz {
  id: string;
  name: string;
}

export interface Lager {
  id: string;
  name: string;
  /** Feste Liste der Plätze dieses Lagers, in der Reihenfolge der Pflege. */
  plaetze: Platz[];
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
  /** Platz im Heimatlager; nur zusammen mit einem Lager. */
  platzId: string | null;
  version: number;
  geaendertAm: string;
  geaendertVon: string;
}

export interface LagerEingabe {
  id: string;
  name: string;
  plaetze: Platz[];
}

export interface ArtikelEingabe {
  id: string;
  name: string;
  einheit: ArtikelEinheit;
  lagerId: string | null;
  /** Fehlt: kein Platz. */
  platzId?: string | null;
}

/** Eine Zeile im Inhalt einer Kiste: Artikel mit Menge (Einheit steht am Artikel) und Bemerkung. */
export interface KistenPosition {
  artikelId: string;
  /** Größer 0, höchstens drei Nachkommastellen. */
  menge: number;
  bemerkung: string;
}

/** Kiste: Stammdatum mit Heimatlager und Inhalt; wird später in Aufbauten verwendet. */
export interface Kiste {
  id: string;
  name: string;
  lagerId: string | null;
  platzId: string | null;
  inhalt: KistenPosition[];
  version: number;
  geaendertAm: string;
  geaendertVon: string;
}

export interface KisteEingabe {
  id: string;
  name: string;
  lagerId: string | null;
  /** Fehlt: kein Platz. */
  platzId?: string | null;
  inhalt: KistenPosition[];
}
