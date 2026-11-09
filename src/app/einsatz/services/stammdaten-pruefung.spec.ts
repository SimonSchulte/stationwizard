import { describe, expect, it } from 'vitest';
import { istArtikel, istArtikelEinheit, istLager } from './stammdaten-pruefung';

const VERWALTUNG = { version: 1, geaendertAm: '2026-11-09T10:00:00.000Z', geaendertVon: 'a@b.c' };

describe('istLager', () => {
  const lager = { id: 'x', name: 'Kaltlager', reihenfolge: 2, ...VERWALTUNG };

  it('nimmt eine vollständige Zeile an', () => {
    expect(istLager(lager)).toBe(true);
  });

  it.each([
    ['null', null],
    ['ohne Namen', { ...lager, name: '' }],
    ['Reihenfolge keine ganze Zahl', { ...lager, reihenfolge: 1.5 }],
    ['Version null', { ...lager, version: 0 }],
    ['ohne Zeitpunkt', { ...lager, geaendertAm: undefined }],
    ['eine Liste', [lager]],
  ])('lehnt ab: %s', (_titel, wert) => {
    expect(istLager(wert)).toBe(false);
  });
});

describe('istArtikel', () => {
  const artikel = {
    id: 'x',
    name: 'Gasflasche',
    einheit: 'Stück',
    lagerId: null,
    ...VERWALTUNG,
  };

  it('nimmt eine Zeile mit und ohne Heimatlager an', () => {
    expect(istArtikel(artikel)).toBe(true);
    expect(istArtikel({ ...artikel, lagerId: 'l1' })).toBe(true);
  });

  it.each([
    ['unbekannte Einheit', { ...artikel, einheit: 'Eimer' }],
    ['lagerId eine Zahl', { ...artikel, lagerId: 5 }],
    ['lagerId leer', { ...artikel, lagerId: '' }],
    ['ohne Version', { ...artikel, version: undefined }],
  ])('lehnt ab: %s', (_titel, wert) => {
    expect(istArtikel(wert)).toBe(false);
  });
});

describe('istArtikelEinheit', () => {
  it('kennt nur die festen Einheiten', () => {
    expect(istArtikelEinheit('Liter')).toBe(true);
    expect(istArtikelEinheit('liter')).toBe(false);
    expect(istArtikelEinheit(3)).toBe(false);
  });
});
