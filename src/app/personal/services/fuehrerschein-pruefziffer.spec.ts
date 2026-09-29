import { describe, expect, it } from 'vitest';
import { fuehrerscheinnummerPruefzifferGueltig } from './fuehrerschein-pruefziffer';

describe('fuehrerscheinnummerPruefzifferGueltig', () => {
  it('bestätigt das Wikipedia-Rechenbeispiel B072RRE2I (Prüfziffer 5)', () => {
    expect(fuehrerscheinnummerPruefzifferGueltig('B072RRE2I50')).toBe('gueltig');
  });

  it('erkennt eine falsche Prüfziffer', () => {
    expect(fuehrerscheinnummerPruefzifferGueltig('B072RRE2I40')).toBe('ungueltig');
  });

  it('erkennt den Sonderfall Rest 10 als Prüfziffer X', () => {
    // Basis '7B9205K0C' ergibt Rest 10 → erwartete Prüfziffer 'X'.
    expect(fuehrerscheinnummerPruefzifferGueltig('7B9205K0CX5')).toBe('gueltig');
  });

  it('meldet die Beispielnummer aus der HiOrg-API-Dokumentation als ungültig', () => {
    // Erfundenes Dokubeispiel, keine echte Prüfziffer – erwartet wäre 'X', nicht '6'.
    expect(fuehrerscheinnummerPruefzifferGueltig('7B9205K0C65')).toBe('ungueltig');
  });

  it('ist ohne prüfbare Form nicht prüfbar', () => {
    expect(fuehrerscheinnummerPruefzifferGueltig(null)).toBeNull();
    expect(fuehrerscheinnummerPruefzifferGueltig(undefined)).toBeNull();
    expect(fuehrerscheinnummerPruefzifferGueltig('')).toBeNull();
    expect(fuehrerscheinnummerPruefzifferGueltig('zu-kurz')).toBeNull();
    expect(fuehrerscheinnummerPruefzifferGueltig('B072RRE2IÄ0')).toBeNull();
  });

  it('ist unabhängig von Groß-/Kleinschreibung und Leerraum', () => {
    expect(fuehrerscheinnummerPruefzifferGueltig(' b072rre2i50 ')).toBe('gueltig');
  });
});
