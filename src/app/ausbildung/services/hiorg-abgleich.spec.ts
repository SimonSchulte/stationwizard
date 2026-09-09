import { describe, expect, it } from 'vitest';
import type { HiorgEintrag } from '../models/hiorg-kalender.model';
import { leererTermin, type Termin } from '../models/plan.model';
import { baueHiorgAbgleich, normalisiereName } from './hiorg-abgleich';

function eintrag(zusatz: Partial<HiorgEintrag> = {}): HiorgEintrag {
  const beginn = zusatz.beginn ?? '2026-05-04';
  return {
    schluessel: `test|${beginn}|${zusatz.name ?? 'x'}`,
    beginn,
    ende: zusatz.ende ?? beginn,
    name: 'Erfundene Ausbildung Verpflegung',
    art: 'termin',
    url: null,
    ...zusatz,
  };
}

function termin(datum: string, thema: string, id = `t-${datum}-${thema}`): Termin {
  return { ...leererTermin(datum), id, thema };
}

describe('Namensnormalisierung für den Abgleich', () => {
  it.each([
    ['  Aufbau   Abbau ', 'aufbau abbau'],
    ['AUFBAU ABBAU', 'aufbau abbau'],
    ['Aufbau &amp; Abbau', 'aufbau & abbau'],
    ['Zeilen\numbruch', 'zeilen umbruch'],
  ])('bildet %s auf %s ab', (eingabe, erwartet) => {
    expect(normalisiereName(eingabe)).toBe(erwartet);
  });

  it('behandelt abweichende Interpunktion als echten Unterschied', () => {
    expect(normalisiereName('HGM4 Teil 1/3')).not.toBe(normalisiereName('HGM4 Teil 1-3'));
  });
});

describe('Abgleich zwischen Jahresplan und HiOrg', () => {
  it('meldet keine Abweichung bei exakt gleichem Namen', () => {
    const abgleich = baueHiorgAbgleich(
      [eintrag({ name: 'Sprechfunkausbildung' })],
      [termin('2026-05-04', 'Sprechfunkausbildung')],
      2026,
    );

    expect(abgleich.anzahlAbweichungen).toBe(0);
    expect(abgleich.nachDatum.get('2026-05-04')?.eintraege).toHaveLength(1);
  });

  it.each([
    ['Groß-/Kleinschreibung', 'SPRECHFUNK AUSBILDUNG'],
    ['führende und doppelte Leerzeichen', '  Sprechfunk   ausbildung  '],
    ['Zeilenumbruch im Thema', 'Sprechfunk\nausbildung'],
  ])('wertet %s nicht als Abweichung', (_fall, thema) => {
    const abgleich = baueHiorgAbgleich(
      [eintrag({ name: 'Sprechfunk ausbildung' })],
      [termin('2026-05-04', thema)],
      2026,
    );

    expect(abgleich.anzahlAbweichungen).toBe(0);
  });

  it('meldet eine Abweichung bei abweichendem Namen', () => {
    const abgleich = baueHiorgAbgleich(
      [eintrag({ name: 'Sprechfunkausbildung Teil 1' })],
      [termin('2026-05-04', 'Sprechfunk', 't1')],
      2026,
    );

    expect(abgleich.anzahlAbweichungen).toBe(1);
    expect(abgleich.tageMitAbweichung.has('2026-05-04')).toBe(true);
    expect(abgleich.nachDatum.get('2026-05-04')?.abweichungen[0]).toMatchObject({
      terminId: 't1',
      terminThema: 'Sprechfunk',
    });
  });

  it('meldet keine Abweichung, wenn einer von mehreren Terminen passt', () => {
    const abgleich = baueHiorgAbgleich(
      [eintrag({ name: 'Sprechfunkausbildung' })],
      [
        termin('2026-05-04', 'Etwas anderes', 't1'),
        termin('2026-05-04', 'Sprechfunkausbildung', 't2'),
      ],
      2026,
    );

    expect(abgleich.anzahlAbweichungen).toBe(0);
  });

  it('behandelt einen Tag ohne Plantermin als Lücke, nicht als Abweichung', () => {
    const abgleich = baueHiorgAbgleich([eintrag({ name: 'Werther Dienstabend' })], [], 2026);
    const tag = abgleich.nachDatum.get('2026-05-04');

    expect(abgleich.anzahlAbweichungen).toBe(0);
    expect(tag?.ohneGegenstueck).toHaveLength(1);
  });

  it('behandelt eine leere Gerüstzeile ohne Thema ebenfalls als Lücke', () => {
    const abgleich = baueHiorgAbgleich(
      [eintrag({ name: 'Werther Dienstabend' })],
      [leererTermin('2026-05-04')],
      2026,
    );

    expect(abgleich.anzahlAbweichungen).toBe(0);
    expect(abgleich.nachDatum.get('2026-05-04')?.ohneGegenstueck).toHaveLength(1);
  });

  it('legt einen mehrtägigen Eintrag auf jeden betroffenen Tag', () => {
    const abgleich = baueHiorgAbgleich(
      [eintrag({ beginn: '2026-05-04', ende: '2026-05-06', name: 'Mehrtägige Übung' })],
      [],
      2026,
    );

    expect([...abgleich.nachDatum.keys()]).toEqual(['2026-05-04', '2026-05-05', '2026-05-06']);
  });

  it('lässt Einträge außerhalb des Planjahres weg', () => {
    const abgleich = baueHiorgAbgleich([eintrag({ beginn: '2027-05-04' })], [], 2026);

    expect(abgleich.nachDatum.size).toBe(0);
  });

  it('beschneidet einen jahresübergreifenden Eintrag auf das Planjahr', () => {
    const abgleich = baueHiorgAbgleich(
      [eintrag({ beginn: '2026-12-30', ende: '2027-01-02', name: 'Jahreswechsel' })],
      [],
      2026,
    );

    expect([...abgleich.nachDatum.keys()]).toEqual(['2026-12-30', '2026-12-31']);
  });

  it('liefert ohne HiOrg-Einträge einen leeren Abgleich', () => {
    const abgleich = baueHiorgAbgleich([], [termin('2026-05-04', 'Irgendwas')], 2026);

    expect(abgleich.nachDatum.size).toBe(0);
    expect(abgleich.anzahlAbweichungen).toBe(0);
  });
});
