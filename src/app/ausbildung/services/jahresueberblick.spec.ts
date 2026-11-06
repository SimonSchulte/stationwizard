import { describe, expect, it } from 'vitest';
import { Termin, leererTermin } from '../models/plan.model';
import { baueJahresueberblick } from './jahresueberblick';
import { baueWochenraster } from './plan-raster';

function termin(datum: string, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), ...aenderung };
}

describe('baueJahresueberblick', () => {
  const termine = [
    termin('2026-03-02', { thema: 'Erfundenes SAN-Thema', kategorie: 'SAN' }),
    termin('2026-03-09'),
  ];
  const wochen = baueWochenraster(
    2026,
    termine,
    new Map([['2026-03-16', 'Erfundener Feiertag']]),
    'Mo',
  );

  it('führt nur Diensttage des Jahres, nach Monat gruppiert', () => {
    const { monate } = baueJahresueberblick(wochen, new Set());

    expect(monate).toHaveLength(12);
    const maerz = monate[2]!.zellen;
    expect(maerz.map((z) => z.datum)).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ]);
    expect(maerz[0]).toMatchObject({
      titel: 'Erfundenes SAN-Thema',
      kategorie: 'SAN',
      luecke: false,
    });
  });

  it('erkennt Lücken, Feiertage und Abweichungen', () => {
    const { monate, kennzahlen } = baueJahresueberblick(wochen, new Set(['2026-03-02']));
    const maerz = monate[2]!.zellen;

    expect(maerz[1]!.luecke).toBe(true);
    expect(maerz[2]).toMatchObject({ luecke: false, titel: 'Erfundener Feiertag' });
    expect(maerz[0]!.abweichung).toBe(true);
    expect(kennzahlen.abweichungen).toBe(1);
    expect(kennzahlen.belegt).toBe(1);
    expect(kennzahlen.nachKategorie.get('SAN')).toBe(1);
    expect(kennzahlen.diensttage).toBe(kennzahlen.belegt + kennzahlen.luecken + 1);
  });

  it('zählt je Monat die Diensttage ohne Feiertag, belegte und Lücken', () => {
    const maerz = baueJahresueberblick(wochen, new Set()).monate[2]!;

    // 2., 9., 16. (Feiertag), 23., 30. März
    expect(maerz.diensttage).toBe(4);
    expect(maerz.belegt).toBe(1);
    expect(maerz.luecken).toBe(3);
  });

  it('zeigt die Uhrzeit nur, wenn sie vom Dienstabend abweicht', () => {
    const mit = baueWochenraster(
      2026,
      [
        termin('2026-03-02', { typ: 'dienst', thema: 'A', beginnZeit: '19:00', endeZeit: '22:30' }),
        termin('2026-03-09', { typ: 'dienst', thema: 'B', beginnZeit: '18:00', endeZeit: '20:00' }),
        termin('2026-03-23', { typ: 'termin', thema: 'C', beginnZeit: '19:00', endeZeit: '22:30' }),
      ],
      new Map(),
      'Mo',
    );
    const zellen = baueJahresueberblick(mit, new Set()).monate[2]!.zellen;

    expect(zellen.map((z) => z.zeit)).toEqual(['', '18:00–20:00', '', '19:00–22:30', '']);
  });
});
