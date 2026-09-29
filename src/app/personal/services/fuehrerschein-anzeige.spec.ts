import { describe, expect, it } from 'vitest';
import { fuehrerscheindatumAnzeige } from './fuehrerschein-anzeige';

describe('fuehrerscheindatumAnzeige', () => {
  it('formatiert ein erkennbares ISO-Datum deutsch', () => {
    expect(fuehrerscheindatumAnzeige('1995-11-01')).toBe('01.11.1995');
  });

  it('lässt einen unerkennbaren Wert unverändert', () => {
    expect(fuehrerscheindatumAnzeige('unbekannt')).toBe('unbekannt');
  });

  it('liefert einen leeren Text ohne Wert', () => {
    expect(fuehrerscheindatumAnzeige(null)).toBe('');
    expect(fuehrerscheindatumAnzeige(undefined)).toBe('');
  });
});
