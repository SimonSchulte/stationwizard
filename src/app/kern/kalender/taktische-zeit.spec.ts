import { describe, expect, it } from 'vitest';
import { formatiereTaktischeZeit, formatiereTaktischeZeitAnzeige } from './taktische-zeit';

describe('Taktische Zeit in Europe/Berlin', () => {
  it.each([
    ['2026-01-15T13:30:00Z', '151430jan26'],
    ['2026-07-15T12:30:00Z', '151430jul26'],
    ['2026-03-29T00:59:00Z', '290159mar26'],
    ['2026-03-29T01:00:00Z', '290300mar26'],
    ['2026-10-25T00:30:00Z', '250230oct26'],
    ['2026-10-25T01:30:00Z', '250230oct26'],
    ['2026-12-31T23:00:00Z', '010000jan27'],
  ])('formatiert %s unabhängig von der Rechnerzeitzone als %s', (iso, erwartet) => {
    expect(formatiereTaktischeZeit(new Date(iso))).toBe(erwartet);
  });

  it('zeigt denselben Berliner Zeitpunkt lesbar an', () => {
    expect(formatiereTaktischeZeitAnzeige(new Date('2026-07-15T12:30:00Z'))).toBe(
      '15.07.2026, 14:30 Uhr',
    );
  });
});
