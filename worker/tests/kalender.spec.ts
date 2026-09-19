import { describe, expect, it } from 'vitest';
import { berlinerKalendertag } from '../src/kalender';

describe('berlinerKalendertag', () => {
  it('bildet den lokalen Kalendertag ab, nicht den UTC-Tag', () => {
    // 23:30 Uhr UTC am 14.09. ist in Berlin bereits der 15.09.
    expect(berlinerKalendertag(new Date('2026-09-14T23:30:00Z'))).toBe('2026-09-15');
    // Und 00:30 UTC im Winter ist in Berlin noch derselbe Tag.
    expect(berlinerKalendertag(new Date('2026-01-15T00:30:00Z'))).toBe('2026-01-15');
  });

  it('bleibt auch am Jahreswechsel beim Berliner Tag', () => {
    // 23:30 UTC am 31.12. ist in Berlin schon der 01.01. des Folgejahres.
    expect(berlinerKalendertag(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
