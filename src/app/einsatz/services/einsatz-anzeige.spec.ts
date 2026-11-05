import { describe, expect, it } from 'vitest';
import {
  abstandInTagen,
  abstandText,
  datumsblock,
  einsatzZeitraumText,
  istDringend,
  lokalerBeginn,
} from './einsatz-anzeige';

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

describe('abstandInTagen', () => {
  const jetzt = new Date('2026-11-05T12:00:00Z');

  it('zählt Berliner Kalendertage, die Uhrzeit spielt keine Rolle', () => {
    expect(abstandInTagen('2026-11-05T00:00', jetzt)).toBe(0);
    expect(abstandInTagen('2026-11-05T23:59', jetzt)).toBe(0);
    expect(abstandInTagen('2026-11-06T00:30', jetzt)).toBe(1);
    expect(abstandInTagen('2026-11-19T10:00', jetzt)).toBe(14);
    expect(abstandInTagen('2026-11-04T10:00', jetzt)).toBe(-1);
  });

  it('nimmt für „heute“ den Berliner Tag, nicht den UTC-Tag', () => {
    // 23:30 UTC am 5.11. ist in Berlin bereits der 6.11.
    expect(abstandInTagen('2026-11-06T09:00', new Date('2026-11-05T23:30:00Z'))).toBe(0);
    // Zeitumstellung (30.10.2027 → 31.10.): kein Tag geht verloren.
    expect(abstandInTagen('2027-11-01T09:00', new Date('2027-10-29T10:00:00Z'))).toBe(3);
  });

  it('liefert null ohne lesbaren Beginn', () => {
    expect(abstandInTagen(null, jetzt)).toBeNull();
    expect(abstandInTagen('kaputt', jetzt)).toBeNull();
  });
});

describe('abstandText und istDringend', () => {
  it('formuliert heute, morgen und in n Tagen', () => {
    expect(abstandText(0)).toBe('heute');
    expect(abstandText(1)).toBe('morgen');
    expect(abstandText(7)).toBe('in 7 Tagen');
    expect(abstandText(-1)).toBe('');
    expect(abstandText(null)).toBe('');
  });

  it('ist dringend bis 14 Tage und nur bei fehlendem PEP oder VB', () => {
    expect(istDringend(14, true, false)).toBe(true);
    expect(istDringend(0, false, true)).toBe(true);
    expect(istDringend(15, true, true)).toBe(false);
    expect(istDringend(5, false, false)).toBe(false);
    expect(istDringend(-1, true, true)).toBe(false);
    expect(istDringend(null, true, true)).toBe(false);
  });
});
