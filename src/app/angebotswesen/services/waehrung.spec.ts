import { describe, expect, it } from 'vitest';
import { centZuEuroEingabe, euroEingabeZuCent, formatEuro, formatStunden } from './waehrung';

describe('formatEuro', () => {
  it('formatiert Cent als deutschen Euro-Betrag', () => {
    // Intl.NumberFormat trennt Betrag und Zeichen mit einem geschützten
    // Leerzeichen (U+00A0), keinem gewöhnlichen – deshalb per Regex geprüft.
    expect(formatEuro(2400)).toMatch(/^24,00\s€$/);
  });
});

describe('formatStunden', () => {
  it('nutzt das Dezimalkomma und lässt überflüssige Nullen weg', () => {
    expect(formatStunden(7.5)).toBe('7,5');
    expect(formatStunden(3)).toBe('3');
    expect(formatStunden(0.25)).toBe('0,25');
    expect(formatStunden(8.1)).toBe('8,1');
  });
});

describe('centZuEuroEingabe', () => {
  it('liefert zwei Nachkommastellen ohne Währungszeichen', () => {
    expect(centZuEuroEingabe(1200)).toBe('12.00');
  });
});

describe('euroEingabeZuCent', () => {
  it('rechnet einen Punkt-Betrag in Cent um', () => {
    expect(euroEingabeZuCent('12.50')).toBe(1250);
  });

  it('akzeptiert ein Komma als Dezimaltrenner', () => {
    expect(euroEingabeZuCent('12,50')).toBe(1250);
  });

  it('lehnt eine negative Eingabe ab', () => {
    expect(euroEingabeZuCent('-1')).toBeNull();
  });

  it('lehnt eine nicht-numerische Eingabe ab', () => {
    expect(euroEingabeZuCent('abc')).toBeNull();
  });
});
