import { describe, expect, it } from 'vitest';
import { hatAbleseLuecke, pruefeAblesungPlausibilitaet } from './ablesung-pruefung';
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
