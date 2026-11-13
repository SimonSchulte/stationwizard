import { describe, expect, it } from 'vitest';
import {
  istArtikel,
  istArtikelEinheit,
  istGueltigeMenge,
  istKiste,
  istLager,
} from './stammdaten-pruefung';

const VERWALTUNG = { version: 1, geaendertAm: '2026-11-09T10:00:00.000Z', geaendertVon: 'a@b.c' };

describe('istLager', () => {
  const lager = {
    id: 'x',
    name: 'Kaltlager',
    plaetze: [{ id: 'p1', name: 'Regal' }],
    reihenfolge: 2,
    ...VERWALTUNG,
  };

  it('nimmt eine vollständige Zeile an', () => {
    expect(istLager(lager)).toBe(true);
  });

  it.each([
    ['null', null],
    ['ohne Namen', { ...lager, name: '' }],
    ['ohne Plätze', { ...lager, plaetze: undefined }],
    ['Platz ohne Namen', { ...lager, plaetze: [{ id: 'p1', name: '' }] }],
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
    platzId: null,
    ...VERWALTUNG,
  };

  it('nimmt eine Zeile mit und ohne Heimatlager an', () => {
    expect(istArtikel(artikel)).toBe(true);
    expect(istArtikel({ ...artikel, lagerId: 'l1' })).toBe(true);
    expect(istArtikel({ ...artikel, lagerId: 'l1', platzId: 'p1' })).toBe(true);
  });

  it.each([
    ['unbekannte Einheit', { ...artikel, einheit: 'Eimer' }],
    ['lagerId eine Zahl', { ...artikel, lagerId: 5 }],
    ['lagerId leer', { ...artikel, lagerId: '' }],
    ['platzId leer', { ...artikel, platzId: '' }],
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

describe('istKiste', () => {
  const kiste = {
    id: 'x',
    name: 'Gewürzkiste',
    lagerId: null,
    platzId: null,
    inhalt: [{ artikelId: 'a1', menge: 2.5, bemerkung: '' }],
    ...VERWALTUNG,
  };

  it('nimmt eine Kiste mit und ohne Inhalt und Heimatlager an', () => {
    expect(istKiste(kiste)).toBe(true);
    expect(istKiste({ ...kiste, inhalt: [], lagerId: 'l1' })).toBe(true);
  });

  it.each([
    ['Inhalt keine Liste', { ...kiste, inhalt: 'x' }],
    ['Position ohne Artikel', { ...kiste, inhalt: [{ menge: 1, bemerkung: '' }] }],
    ['Menge null', { ...kiste, inhalt: [{ artikelId: 'a', menge: 0, bemerkung: '' }] }],
    ['Menge Text', { ...kiste, inhalt: [{ artikelId: 'a', menge: '1', bemerkung: '' }] }],
    ['Bemerkung fehlt', { ...kiste, inhalt: [{ artikelId: 'a', menge: 1 }] }],
    ['ohne Version', { ...kiste, version: undefined }],
  ])('lehnt ab: %s', (_titel, wert) => {
    expect(istKiste(wert)).toBe(false);
  });
});

describe('istGueltigeMenge', () => {
  it.each([1, 0.001, 2.5, 0.1, 85, 1_000_000])('nimmt %s an', (menge) => {
    expect(istGueltigeMenge(menge)).toBe(true);
  });

  it.each([0, -1, 1.2345, 1_000_001, NaN, Infinity])('lehnt %s ab', (menge) => {
    expect(istGueltigeMenge(menge)).toBe(false);
  });
});
