import { describe, expect, it } from 'vitest';
import {
  hatAbleseLuecke,
  KILOMETERSTAND_MAX,
  leseKilometerEingabe,
  pruefeAblesungPlausibilitaet,
} from './ablesung-pruefung';
import { erzeugeTestablesung } from '../testing/fahrzeug-testdaten';

describe('pruefeAblesungPlausibilitaet', () => {
  it('gibt keinen Hinweis ohne Vorablesung', () => {
    expect(pruefeAblesungPlausibilitaet(5000, null)).toBeNull();
  });

  it('gibt keinen Hinweis bei einem gewöhnlichen Zuwachs', () => {
    expect(pruefeAblesungPlausibilitaet(10_100, { stand: 10_000 })).toBeNull();
  });

  it('warnt vor einem Tachorückschritt', () => {
    expect(pruefeAblesungPlausibilitaet(9000, { stand: 10_000 })).toBe('rueckschritt');
  });

  it('warnt vor einem unplausibel großen Sprung', () => {
    expect(pruefeAblesungPlausibilitaet(20_000, { stand: 10_000 })).toBe('unplausibler-sprung');
  });

  it('blockiert nicht: der Sprung bleibt nur ein Hinweis, kein Fehler', () => {
    expect(() => pruefeAblesungPlausibilitaet(20_000, { stand: 10_000 })).not.toThrow();
  });
});

describe('hatAbleseLuecke', () => {
  it('meldet eine Lücke, wenn noch nie abgelesen wurde', () => {
    expect(hatAbleseLuecke(null, '2026-06-01')).toBe(true);
  });

  it('meldet keine Lücke innerhalb von 30 Tagen', () => {
    const letzte = erzeugeTestablesung({ abgelesenAm: '2026-05-15' });
    expect(hatAbleseLuecke(letzte, '2026-06-01')).toBe(false);
  });

  it('meldet eine Lücke ab dem 31. Tag', () => {
    const letzte = erzeugeTestablesung({ abgelesenAm: '2026-05-01' });
    expect(hatAbleseLuecke(letzte, '2026-06-02')).toBe(true);
  });

  it('meldet am genauen Schwellwert von 30 Tagen noch keine Lücke', () => {
    const letzte = erzeugeTestablesung({ abgelesenAm: '2026-05-01' });
    expect(hatAbleseLuecke(letzte, '2026-05-31')).toBe(false);
  });
});

describe('leseKilometerEingabe', () => {
  it('erkennt leere Eingaben', () => {
    expect(leseKilometerEingabe('')).toEqual({ art: 'leer' });
    expect(leseKilometerEingabe('   ')).toEqual({ art: 'leer' });
  });

  it('liest ganze Zahlen, auch mit umgebenden Leerzeichen und Nullen', () => {
    expect(leseKilometerEingabe(' 12345 ')).toEqual({ art: 'gueltig', stand: 12345 });
    expect(leseKilometerEingabe('0')).toEqual({ art: 'gueltig', stand: 0 });
  });

  it('liest korrekt gruppierte Tausendertrenner als Tausender, nicht als Dezimalpunkt', () => {
    expect(leseKilometerEingabe('12.345')).toEqual({ art: 'gueltig', stand: 12345 });
    expect(leseKilometerEingabe('1.234.567')).toEqual({ art: 'gueltig', stand: 1234567 });
    expect(leseKilometerEingabe('12 345')).toEqual({ art: 'gueltig', stand: 12345 });
  });

  it('lehnt Nachkommastellen ab, statt das Komma stillschweigend zu verwerfen', () => {
    for (const text of ['12345,5', '12345.5', '12.345,5', '0,5']) {
      expect(leseKilometerEingabe(text)).toEqual({ art: 'ungueltig', fehler: 'keine-ganzzahl' });
    }
  });

  it('lehnt Negatives, Text und Exponentialschreibweise ab', () => {
    for (const text of ['-5', 'abc', '1e5', '12a', '+7', '1..2']) {
      expect(leseKilometerEingabe(text)).toEqual({ art: 'ungueltig', fehler: 'kein-zahlenwert' });
    }
  });

  it('lehnt unsinnig große Werte ab', () => {
    expect(leseKilometerEingabe(String(KILOMETERSTAND_MAX))).toEqual({
      art: 'gueltig',
      stand: KILOMETERSTAND_MAX,
    });
    expect(leseKilometerEingabe(String(KILOMETERSTAND_MAX + 1))).toEqual({
      art: 'ungueltig',
      fehler: 'zu-gross',
    });
  });
});
