import { describe, expect, it } from 'vitest';
import { hiorgZeitAlsLokal } from './einsatz-zeit';

describe('hiorgZeitAlsLokal', () => {
  it('rechnet UTC-Werte nach Berliner Zeit um (Winter und Sommer)', () => {
    expect(hiorgZeitAlsLokal('2026-12-05T09:00:00.000Z')).toBe('2026-12-05T10:00');
    expect(hiorgZeitAlsLokal('2026-07-01T10:30:00Z')).toBe('2026-07-01T12:30');
    expect(hiorgZeitAlsLokal('2026-07-01T10:30:00+02:00')).toBe('2026-07-01T10:30');
  });

  it('verschiebt Mitternacht nicht über den Kalendertag', () => {
    expect(hiorgZeitAlsLokal('2026-12-05T23:30:00Z')).toBe('2026-12-06T00:30');
  });

  it('kürzt Werte ohne Zone, ohne sie zu verschieben', () => {
    expect(hiorgZeitAlsLokal('2026-12-05 08:15:00')).toBe('2026-12-05T08:15');
    expect(hiorgZeitAlsLokal('2026-12-05T08:15')).toBe('2026-12-05T08:15');
  });

  it('ergänzt bei reinem Datum Mitternacht und lehnt Unlesbares ab', () => {
    expect(hiorgZeitAlsLokal('2026-12-05')).toBe('2026-12-05T00:00');
    expect(hiorgZeitAlsLokal('')).toBeNull();
    expect(hiorgZeitAlsLokal(undefined)).toBeNull();
    expect(hiorgZeitAlsLokal('gestern')).toBeNull();
  });
});
