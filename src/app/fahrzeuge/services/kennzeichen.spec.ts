import { describe, expect, it } from 'vitest';
import { normalisiereKennzeichen } from './kennzeichen';

describe('Vergleichsform eines Kennzeichens', () => {
  it('erkennt Schreibvarianten desselben Kennzeichens als gleich', () => {
    const erwartet = 'XYTE123';
    for (const variante of ['XY-TE 123', 'xy te123', 'XYTE123', 'xy-te-123', 'XY.TE.123']) {
      expect(normalisiereKennzeichen(variante), variante).toBe(erwartet);
    }
  });

  it('hält verschiedene Kennzeichen auseinander', () => {
    expect(normalisiereKennzeichen('XY-TE 123')).not.toBe(normalisiereKennzeichen('XY-TE 124'));
    expect(normalisiereKennzeichen('XY-TE 123')).not.toBe(normalisiereKennzeichen('XZ-TE 123'));
  });

  it('bildet ein leeres oder nur aus Trennzeichen bestehendes Kennzeichen auf leer ab', () => {
    expect(normalisiereKennzeichen('')).toBe('');
    expect(normalisiereKennzeichen('  -  ')).toBe('');
  });
});
