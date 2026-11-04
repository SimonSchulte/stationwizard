import { describe, expect, it } from 'vitest';
import { einsatzZeitraumText } from './einsatz-anzeige';

describe('einsatzZeitraumText', () => {
  it('stellt lokale Zeiten ohne Zeitzonenverschiebung um', () => {
    expect(einsatzZeitraumText('2026-12-05T00:30', '2026-12-05T20:00')).toBe(
      '05.12.2026, 00:30–20:00 Uhr',
    );
  });

  it('nennt beide Tage bei mehrtägigen Einsätzen', () => {
    expect(einsatzZeitraumText('2026-12-05T10:00', '2026-12-06T02:00')).toBe(
      '05.12.2026, 10:00 – 06.12.2026, 02:00 Uhr',
    );
  });

  it('kommt mit nur einem Wert oder keinem zurecht', () => {
    expect(einsatzZeitraumText('2026-12-05T10:00', null)).toBe('05.12.2026, 10:00 Uhr');
    expect(einsatzZeitraumText(null, '2026-12-05T20:00')).toBe('bis 05.12.2026, 20:00 Uhr');
    expect(einsatzZeitraumText(null, null)).toBe('');
    expect(einsatzZeitraumText('kaputt', null)).toBe('');
  });
});
