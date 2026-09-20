import { describe, expect, it } from 'vitest';
import { istGueltigeSchichtzeit } from './schicht-validierung';

describe('istGueltigeSchichtzeit', () => {
  it('akzeptiert eine gültige Spanne', () => {
    expect(istGueltigeSchichtzeit('08:00', '20:00')).toBe(true);
  });

  it('lehnt bis === von ab', () => {
    expect(istGueltigeSchichtzeit('08:00', '08:00')).toBe(false);
  });

  it('lehnt bis < von ab (kein Tagesüberlauf)', () => {
    expect(istGueltigeSchichtzeit('20:00', '08:00')).toBe(false);
  });

  it('lehnt eine Uhrzeit mit Stunde 24 ab', () => {
    expect(istGueltigeSchichtzeit('08:00', '24:00')).toBe(false);
  });

  it('lehnt ein ungültiges Format ab', () => {
    expect(istGueltigeSchichtzeit('08:00', 'abc')).toBe(false);
    expect(istGueltigeSchichtzeit('abc', '20:00')).toBe(false);
  });
});
