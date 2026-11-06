import { describe, expect, it } from 'vitest';
import { testFeedEintrag } from '../testing/veranstaltung-testdaten';
import {
  artAusVeranstaltungsId,
  gruppiereVeranstaltungen,
  monatMitAbstand,
  veranstaltungsId,
} from './hiorg-veranstaltungen';

describe('monatMitAbstand', () => {
  it('rechnet über Jahresgrenzen vor und zurück', () => {
    expect(monatMitAbstand('2026-11-06', 0)).toBe('2026-11');
    expect(monatMitAbstand('2026-11-06', 11)).toBe('2027-10');
    expect(monatMitAbstand('2026-11-06', 2)).toBe('2027-01');
    expect(monatMitAbstand('2026-11-06', -6)).toBe('2026-05');
    expect(monatMitAbstand('2026-02-01', -2)).toBe('2025-12');
    expect(monatMitAbstand('2026-01-31', -12)).toBe('2025-01');
  });
});

describe('veranstaltungsId', () => {
  it('trennt Dienste und Termine mit gleicher Feed-Id', () => {
    expect(veranstaltungsId('dienst', '5')).toBe('dienst-5');
    expect(veranstaltungsId('termin', '5')).toBe('termin-5');
  });

  it('ersetzt unzulässige Zeichen und bleibt höchstens 64 Zeichen lang', () => {
    expect(veranstaltungsId('dienst', 'a/b c')).toBe('dienst-a_b_c');
    expect(veranstaltungsId('termin', 'x'.repeat(100))).toHaveLength(64);
  });

  it('liest die Art aus einer gespeicherten Id zurück', () => {
    expect(artAusVeranstaltungsId('dienst-5')).toBe('dienst');
    expect(artAusVeranstaltungsId('termin-5')).toBe('termin');
    expect(artAusVeranstaltungsId('4711')).toBeNull();
    expect(artAusVeranstaltungsId(null)).toBeNull();
  });
});

describe('gruppiereVeranstaltungen', () => {
  it('bildet aus einem Eintrag eine Veranstaltung mit lokalem Zeitraum', () => {
    const [v] = gruppiereVeranstaltungen([testFeedEintrag()]);
    expect(v).toMatchObject({
      veranstaltungId: 'dienst-4711',
      art: 'dienst',
      titel: 'Weihnachtsmarkt Ummeln',
      beginn: '2026-12-05T10:00',
      ende: '2026-12-05T20:30',
    });
    expect(v.schichten).toHaveLength(1);
  });

  it('setzt ohne Uhrzeiten 00:00 als Beginn und 23:59 als Ende', () => {
    const [v] = gruppiereVeranstaltungen([
      testFeedEintrag({ beginnZeit: '', endeZeit: '', ende: '2026-12-07' }),
    ]);
    expect(v.beginn).toBe('2026-12-05T00:00');
    expect(v.ende).toBe('2026-12-07T23:59');
  });

  it('fasst gleiche Art und Id zu Schichten zusammen, sortiert nach Beginn', () => {
    const spaet = testFeedEintrag({
      schluessel: 'spaet',
      beginn: '2026-12-06',
      ende: '2026-12-06',
      beginnZeit: '14:00',
      endeZeit: '22:00',
    });
    const frueh = testFeedEintrag({ schluessel: 'frueh' });
    const [v] = gruppiereVeranstaltungen([spaet, frueh]);
    expect(v.schichten.map((s) => s.schluessel)).toEqual(['frueh', 'spaet']);
    expect(v.beginn).toBe('2026-12-05T10:00');
    expect(v.ende).toBe('2026-12-06T22:00');
  });

  it('hält Dienst und Termin mit gleicher Feed-Id getrennt', () => {
    const liste = gruppiereVeranstaltungen([
      testFeedEintrag({ schluessel: 'a', art: 'dienst', id: '5' }),
      testFeedEintrag({ schluessel: 'b', art: 'termin', id: '5' }),
    ]);
    expect(liste.map((v) => v.veranstaltungId).sort()).toEqual(['dienst-5', 'termin-5']);
  });

  it('zählt einen in beiden Abruffenstern gelieferten Eintrag nur einmal', () => {
    const [v] = gruppiereVeranstaltungen([testFeedEintrag(), testFeedEintrag()]);
    expect(v.schichten).toHaveLength(1);
  });

  it('sortiert die Veranstaltungen nach Beginn', () => {
    const liste = gruppiereVeranstaltungen([
      testFeedEintrag({ schluessel: 'b', id: '2', beginn: '2026-12-09', ende: '2026-12-09' }),
      testFeedEintrag({ schluessel: 'a', id: '1' }),
    ]);
    expect(liste.map((v) => v.veranstaltungId)).toEqual(['dienst-1', 'dienst-2']);
  });
});
