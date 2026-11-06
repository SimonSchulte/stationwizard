import { describe, expect, it } from 'vitest';
import { leererTermin, Termin } from '../models/plan.model';
import {
  abstandZuHeute,
  blockZeile,
  hatBesondereZeit,
  mehrtaegigText,
  monatKurz,
  monatsErsterMarke,
  monatsTitel,
  zeitBisText,
} from './datum-anzeige';

function termin(aenderung: Partial<Termin>): Termin {
  return { ...leererTermin('2026-03-07'), ...aenderung };
}

describe('abstandZuHeute', () => {
  it('nennt heute, morgen und n Tage für die nächsten 14 Tage', () => {
    expect(abstandZuHeute('2026-03-03', '2026-03-03')?.text).toBe('heute');
    expect(abstandZuHeute('2026-03-04', '2026-03-03')?.text).toBe('morgen');
    expect(abstandZuHeute('2026-03-09', '2026-03-03')?.text).toBe('in 6 Tagen');
    expect(abstandZuHeute('2026-03-17', '2026-03-03')?.text).toBe('in 14 Tagen');
  });

  it('zeigt nichts für Vergangenes und für Fernes', () => {
    expect(abstandZuHeute('2026-03-02', '2026-03-03')).toBeNull();
    expect(abstandZuHeute('2026-03-18', '2026-03-03')).toBeNull();
  });

  it('rechnet über Monats- und Jahresgrenzen und die Zeitumstellung', () => {
    expect(abstandZuHeute('2026-04-02', '2026-03-31')?.text).toBe('in 2 Tagen');
    expect(abstandZuHeute('2027-01-02', '2026-12-31')?.text).toBe('in 2 Tagen');
    expect(abstandZuHeute('2026-03-30', '2026-03-28')?.text).toBe('in 2 Tagen');
  });

  it('hebt nur eine bevorstehende Lücke hervor, nicht den heutigen Tag und keinen belegten Tag', () => {
    expect(abstandZuHeute('2026-03-16', '2026-03-03', true)?.dringend).toBe(true);
    expect(abstandZuHeute('2026-03-16', '2026-03-03', false)?.dringend).toBe(false);
    expect(abstandZuHeute('2026-03-03', '2026-03-03', true)?.dringend).toBe(false);
  });
});

describe('hatBesondereZeit', () => {
  it('hält den Dienstabend 19:00 bis 22:30 für den Normalfall', () => {
    expect(
      hatBesondereZeit(termin({ typ: 'dienst', beginnZeit: '19:00', endeZeit: '22:30' })),
    ).toBe(false);
  });

  it('meldet einen Dienst mit anderer Zeit und jeden Termin mit Zeit', () => {
    expect(
      hatBesondereZeit(termin({ typ: 'dienst', beginnZeit: '18:00', endeZeit: '22:30' })),
    ).toBe(true);
    expect(
      hatBesondereZeit(termin({ typ: 'termin', beginnZeit: '19:00', endeZeit: '22:30' })),
    ).toBe(true);
  });

  it('meldet nichts ohne Zeit', () => {
    expect(hatBesondereZeit(termin({ typ: 'termin', beginnZeit: '', endeZeit: '' }))).toBe(false);
  });
});

describe('Zeittexte', () => {
  it('bildet „bis“ und „ab“', () => {
    expect(zeitBisText(termin({ beginnZeit: '19:00', endeZeit: '21:30' }))).toBe('bis 21:30');
    expect(zeitBisText(termin({ beginnZeit: '19:00', endeZeit: '' }))).toBe('ab 19:00');
    expect(zeitBisText(termin({ beginnZeit: '', endeZeit: '' }))).toBe('');
  });
});

describe('blockZeile', () => {
  it('zeigt Wochentag und Beginn bei genau einem Termin', () => {
    expect(blockZeile('2026-03-03', [termin({ datum: '2026-03-03', beginnZeit: '19:00' })])).toBe(
      'Di · 19:00',
    );
  });

  it('zeigt nur den Wochentag ohne Zeit, ohne Termin und bei mehreren Terminen', () => {
    expect(blockZeile('2026-03-03', [termin({ beginnZeit: '' })])).toBe('Di');
    expect(blockZeile('2026-03-03', [])).toBe('Di');
    expect(
      blockZeile('2026-03-03', [termin({ beginnZeit: '19:00' }), termin({ beginnZeit: '20:00' })]),
    ).toBe('Di');
  });

  it('zeigt bei einem mehrtägigen Termin den Zeitraum der Wochentage am ersten Tag', () => {
    const mehrtaegig = termin({ datum: '2026-03-07', datumBis: '2026-03-08', beginnZeit: '10:00' });
    expect(blockZeile('2026-03-07', [mehrtaegig])).toBe('Sa–So');
    expect(blockZeile('2026-03-08', [mehrtaegig])).toBe('So');
  });
});

describe('Monatstexte', () => {
  it('bildet Titel, Kurzform und die Marke des Monatsersten', () => {
    expect(monatsTitel('2026-03-14')).toBe('März 2026');
    expect(monatKurz('2026-03-14')).toBe('MÄR');
    expect(monatsErsterMarke('2026-04-01')).toBe('1. APR');
    expect(monatsErsterMarke('2026-04-02')).toBeNull();
  });

  it('beschreibt einen mehrtägigen Termin', () => {
    expect(mehrtaegigText(termin({ datum: '2026-03-07', datumBis: '2026-03-08' }), 2)).toBe(
      '2 Tage · bis So 08.03.',
    );
    expect(mehrtaegigText(termin({ datumBis: null }), 1)).toBe('');
  });
});
