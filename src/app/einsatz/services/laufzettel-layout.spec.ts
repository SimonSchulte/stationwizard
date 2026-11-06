import { describe, expect, it } from 'vitest';
import { testAbschnitt, testInhalt, testLaufzettel, testPosition } from '../testing/vb-testdaten';
import { VbInhalt } from '../models/vb.model';
import { baueLaufzettelStreifen as baueMit, seitenAufteilen } from './laufzettel-layout';
import { LAUFZETTEL_KAPAZITAET } from './laufzettel-platz';

// Die bisherigen Fälle gelten für drei Streifen je Seite (38 Zeichen je Zeile).
const baueLaufzettelStreifen = (inhalt: VbInhalt) => baueMit(inhalt, 3);

const LANG = 'x'.repeat(76); // zwei Zeilen

describe('baueLaufzettelStreifen', () => {
  it('nummeriert fortlaufend über alle Abschnitte', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({ laufzettel: [testLaufzettel(), testLaufzettel()] }),
        testAbschnitt({ titel: 'Zwei', farbe: 'abschnitt-2', laufzettel: [testLaufzettel()] }),
      ],
    });
    const streifen = baueLaufzettelStreifen(inhalt);
    expect(streifen.map((s) => s.nr)).toEqual([1, 2, 3]);
    expect(streifen[2].abschnitt).toEqual({ titel: 'Zwei', farbe: 'abschnitt-2' });
    expect(streifen.every((s) => !s.istFortsetzung)).toBe(true);
  });

  it('füllt das Raster mit leeren Zeilen bis 23', () => {
    const lz = testLaufzettel({ positionen: [testPosition(), testPosition({ material: LANG })] });
    const [s] = baueLaufzettelStreifen(
      testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [lz] })] }),
    );
    expect(s.belegt).toBe(3);
    expect(s.leereZeilen).toBe(20);
    expect(s.belegt + s.leereZeilen).toBe(LAUFZETTEL_KAPAZITAET);
  });

  it('erzeugt einen Streifen auch für einen Laufzettel ohne Positionen', () => {
    const lz = testLaufzettel({ positionen: [] });
    const streifen = baueLaufzettelStreifen(
      testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [lz] })] }),
    );
    expect(streifen).toHaveLength(1);
    expect(streifen[0].leereZeilen).toBe(23);
  });

  it('übernimmt die Fachgruppe des Abschnitts, wenn der Laufzettel keine hat', () => {
    const lz = testLaufzettel({ fachgruppe: null });
    const lz2 = testLaufzettel({ fachgruppe: 'tesi' });
    const streifen = baueLaufzettelStreifen(
      testInhalt({
        abschnitte: [testAbschnitt({ fachgruppe: 'verpflegung', laufzettel: [lz, lz2] })],
      }),
    );
    expect(streifen.map((s) => s.fachgruppe)).toEqual(['verpflegung', 'tesi']);
  });

  it('teilt einen zu vollen Laufzettel in Streifen und Fortsetzung mit gleichen Kopfdaten', () => {
    const positionen = Array.from({ length: 30 }, (_, i) => testPosition({ material: `Pos ${i}` }));
    const lz = testLaufzettel({ positionen, lagerort: 'Halle 2' });
    const nachher = testLaufzettel();
    const streifen = baueLaufzettelStreifen(
      testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [lz, nachher] })] }),
    );
    expect(streifen).toHaveLength(3);
    expect(streifen.map((s) => [s.nr, s.istFortsetzung])).toEqual([
      [1, false],
      [1, true],
      [2, false],
    ]);
    expect(streifen[0].positionen).toHaveLength(23);
    expect(streifen[1].positionen).toHaveLength(7);
    expect(streifen[1].lagerort).toBe('Halle 2');
    expect(streifen[1].ueberschrift).toBe(lz.ueberschrift);
    // keine Position geht verloren oder doppelt
    expect(streifen.slice(0, 2).flatMap((s) => s.positionen.map((p) => p.id))).toEqual(
      positionen.map((p) => p.id),
    );
    for (const s of streifen) expect(s.belegt).toBeLessThanOrEqual(LAUFZETTEL_KAPAZITAET);
  });

  it('berücksichtigt mehrzeilige Positionen und Umbruchzeilen der Infofelder beim Aufteilen', () => {
    const positionen = Array.from({ length: 14 }, () => testPosition({ material: LANG }));
    const lz = testLaufzettel({ positionen, lagerort: 'y'.repeat(180) });
    const streifen = baueLaufzettelStreifen(
      testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [lz] })] }),
    );
    expect(streifen.length).toBeGreaterThan(1);
    for (const s of streifen) {
      expect(s.belegt).toBeLessThanOrEqual(LAUFZETTEL_KAPAZITAET);
      expect(s.belegt + s.leereZeilen).toBe(LAUFZETTEL_KAPAZITAET);
    }
  });

  it('gibt einer sehr langen Position mindestens einen eigenen Streifen, ohne Endlosschleife', () => {
    const lz = testLaufzettel({
      positionen: Array.from({ length: 5 }, () => testPosition({ material: 'm'.repeat(200) })),
      lagerort: 'a'.repeat(200),
      transportMit: 'b'.repeat(200),
      auftraggeber: 'c'.repeat(200),
    });
    const streifen = baueLaufzettelStreifen(
      testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [lz] })] }),
    );
    expect(streifen.flatMap((s) => s.positionen)).toHaveLength(5);
    expect(streifen.every((s) => s.positionen.length >= 1)).toBe(true);
  });

  it('liefert ohne Laufzettel keine Streifen', () => {
    expect(baueLaufzettelStreifen(testInhalt({ abschnitte: [] }))).toEqual([]);
  });
});

describe('seitenAufteilen', () => {
  const streifenMit = (n: number) =>
    baueLaufzettelStreifen(
      testInhalt({
        abschnitte: [
          testAbschnitt({ laufzettel: Array.from({ length: n }, () => testLaufzettel()) }),
        ],
      }),
    );

  it('verteilt je drei Streifen auf eine Seite', () => {
    expect(seitenAufteilen(streifenMit(7), 3).map((s) => s.length)).toEqual([3, 3, 1]);
    expect(seitenAufteilen(streifenMit(6), 3)).toHaveLength(2);
    expect(seitenAufteilen(streifenMit(1), 3)).toHaveLength(1);
    expect(seitenAufteilen([], 3)).toEqual([]);
  });

  it('zählt 17 Laufzettel als sechs Seiten bei drei und drei Seiten bei sechs je Seite', () => {
    expect(seitenAufteilen(streifenMit(17), 3)).toHaveLength(6);
    expect(seitenAufteilen(streifenMit(17), 6).map((s) => s.length)).toEqual([6, 6, 5]);
  });

  it('nimmt ohne Angabe die Vorgabe von sechs je Seite', () => {
    expect(seitenAufteilen(streifenMit(7))).toHaveLength(2);
  });
});

describe('baueLaufzettelStreifen je Layout', () => {
  it('teilt dieselben Positionen auf sechs Streifen früher in Fortsetzungen', () => {
    const positionen = Array.from({ length: 12 }, (_, i) =>
      testPosition({ material: `Position ${i} ${'x'.repeat(24)}` }),
    );
    const inhalt = testInhalt({
      abschnitte: [testAbschnitt({ laufzettel: [testLaufzettel({ positionen })] })],
    });
    expect(baueMit(inhalt, 3)).toHaveLength(1);
    const sechs = baueMit(inhalt, 6);
    expect(sechs.length).toBeGreaterThan(1);
    expect(sechs.map((s) => s.istFortsetzung)).toEqual(sechs.map((_, i) => i > 0));
    expect(sechs.flatMap((s) => s.positionen.map((p) => p.id))).toEqual(
      positionen.map((p) => p.id),
    );
    for (const s of sechs) expect(s.belegt).toBeLessThanOrEqual(LAUFZETTEL_KAPAZITAET);
  });
});
