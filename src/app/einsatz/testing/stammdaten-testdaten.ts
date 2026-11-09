import { Artikel, Lager } from '../models/stammdaten.model';

let zaehler = 0;

/** Eindeutige, UUID-förmige Kennung für Tests. */
export function testKennung(): string {
  zaehler += 1;
  return `00000000-0000-4000-8000-${String(zaehler).padStart(12, '0')}`;
}

export function erzeugeTestLager(ueberschreibung: Partial<Lager> = {}): Lager {
  return {
    id: testKennung(),
    name: 'Küchenlager',
    reihenfolge: 1,
    version: 1,
    geaendertAm: '2026-11-09T10:00:00.000Z',
    geaendertVon: 'test@example.invalid',
    ...ueberschreibung,
  };
}

export function erzeugeTestArtikel(ueberschreibung: Partial<Artikel> = {}): Artikel {
  return {
    id: testKennung(),
    name: 'Gasflasche 5 kg',
    einheit: 'Stück',
    lagerId: null,
    version: 1,
    geaendertAm: '2026-11-09T10:00:00.000Z',
    geaendertVon: 'test@example.invalid',
    ...ueberschreibung,
  };
}
