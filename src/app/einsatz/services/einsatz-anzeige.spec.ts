import { describe, expect, it } from 'vitest';
import { datumsblock, einsatzZeitraumText, lokalerBeginn } from './einsatz-anzeige';

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

describe('lokalerBeginn und datumsblock', () => {
  it('stellt Werte ohne Zone nur um, ohne den Tag zu verschieben', () => {
    expect(lokalerBeginn('2026-12-05T00:30')).toBe('2026-12-05T00:30');
    expect(lokalerBeginn('2026-12-05 00:30:00')).toBe('2026-12-05T00:30');
    expect(lokalerBeginn('2026-12-05')).toBe('2026-12-05T00:00');
    expect(lokalerBeginn('')).toBeNull();
    expect(lokalerBeginn('kein Datum')).toBeNull();
  });

  it('rechnet einen Wert mit Zone in die lokale Zeit um', () => {
    const wert = new Date(2026, 11, 5, 8, 15);
    expect(lokalerBeginn(wert.toISOString())).toBe('2026-12-05T08:15');
  });

  it('baut den Datumsblock mit Jahr nur außerhalb des aktuellen Jahres', () => {
    expect(datumsblock('2026-03-07T10:00', 2026)).toEqual({
      monat: 'MÄR',
      tag: '7',
      wochentagZeit: 'Sa · 10:00',
    });
    expect(datumsblock('2027-03-07T10:00', 2026)?.monat).toBe('MÄR 2027');
    expect(datumsblock(null, 2026)).toBeNull();
  });
});
