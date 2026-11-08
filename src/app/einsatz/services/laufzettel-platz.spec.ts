import { describe, expect, it } from 'vitest';
import { testAbschnitt, testInhalt, testLaufzettel, testPosition } from '../testing/vb-testdaten';
import { VbInhalt, VbLaufzettel } from '../models/vb.model';
import {
  LAUFZETTEL_KAPAZITAET,
  STREIFEN_STANDARD,
  gueltigeStreifenZahl,
  laufzettelMasse,
  laufzettelNummern,
  laufzettelPlatz as platzMit,
  ueberlaufPositionen as ueberlaufMit,
  zuVolleLaufzettel as zuVolleMit,
} from './laufzettel-platz';

// Die bisherigen Fälle gelten für das Layout mit drei Streifen je Seite (38 Zeichen je Zeile).
const DREI = 3;
const { zeichenJeZeile: ZEICHEN_JE_ZEILE, zeichenJeZielzeile: ZEICHEN_JE_ZIELZEILE } =
  laufzettelMasse(DREI);
const ZEICHEN_JE_INFOZEILE = laufzettelMasse(DREI).zeichenJeInfozeile;
const laufzettelPlatz = (l: VbLaufzettel) => platzMit(l, DREI);
const ueberlaufPositionen = (l: VbLaufzettel) => ueberlaufMit(l, DREI);
const zuVolleLaufzettel = (i: VbInhalt) => zuVolleMit(i, DREI);

function mitPositionen(anzahl: number, material = 'Stuhl') {
  return testLaufzettel({
    positionen: Array.from({ length: anzahl }, () => testPosition({ material })),
    lagerort: '',
    transportMit: '',
    auftraggeber: '',
  });
}

describe('laufzettelPlatz', () => {
  it('zählt je Position mindestens eine Zeile', () => {
    expect(laufzettelPlatz(mitPositionen(6)).belegt).toBe(6);
    expect(laufzettelPlatz(mitPositionen(0)).belegt).toBe(0);
  });

  it('zählt Umbruchzeilen langer Materialtexte', () => {
    const lang = 'x'.repeat(ZEICHEN_JE_ZEILE);
    const doppelt = 'x'.repeat(ZEICHEN_JE_ZEILE + 1);
    expect(laufzettelPlatz(mitPositionen(1, lang)).belegt).toBe(1);
    expect(laufzettelPlatz(mitPositionen(1, doppelt)).belegt).toBe(2);
    expect(laufzettelPlatz(mitPositionen(1, '')).belegt).toBe(1);
  });

  it('hält eine Umbruchzeile der Zielfelder als Reserve, jede weitere kostet eine Zeile', () => {
    const basis = mitPositionen(3);
    const z = ZEICHEN_JE_ZIELZEILE;
    expect(laufzettelPlatz({ ...basis, lagerort: 'y'.repeat(z) }).belegt).toBe(3);
    expect(laufzettelPlatz({ ...basis, lagerort: 'y'.repeat(z + 1) }).belegt).toBe(3);
    expect(
      laufzettelPlatz({
        ...basis,
        lagerort: 'y'.repeat(z + 1),
        transportMit: 'y'.repeat(z + 1),
      }).belegt,
    ).toBe(4);
    expect(laufzettelPlatz({ ...basis, lagerort: 'y'.repeat(2 * z + 1) }).belegt).toBe(4);
  });

  it('rechnet „Rückfragen an“ weiter mit der Info-Zeichenzahl', () => {
    const basis = mitPositionen(3);
    const i = ZEICHEN_JE_INFOZEILE;
    // 40 Zeichen sind im Zielblock zwei Zeilen, in der Infozeile nur eine.
    expect(
      laufzettelPlatz({ ...basis, lagerort: 'y'.repeat(40), transportMit: 'y'.repeat(40) }).belegt,
    ).toBe(4);
    expect(laufzettelPlatz({ ...basis, auftraggeber: 'y'.repeat(i) }).belegt).toBe(3);
    expect(
      laufzettelPlatz({
        ...basis,
        auftraggeber: 'y'.repeat(i + 1),
        lagerort: 'y'.repeat(ZEICHEN_JE_ZIELZEILE + 1),
      }).belegt,
    ).toBe(4);
  });

  it('bestimmt den Zustand an den Grenzen 21 und 23', () => {
    expect(laufzettelPlatz(mitPositionen(20)).zustand).toBe('ok');
    expect(laufzettelPlatz(mitPositionen(21)).zustand).toBe('knapp');
    expect(laufzettelPlatz(mitPositionen(LAUFZETTEL_KAPAZITAET)).zustand).toBe('knapp');
    const voll = laufzettelPlatz(mitPositionen(24));
    expect(voll.zustand).toBe('zu-voll');
    expect(voll.kapazitaet).toBe(23);
  });
});

describe('laufzettelNummern und zuVolleLaufzettel', () => {
  const a = testLaufzettel();
  const b = mitPositionen(30);
  const c = testLaufzettel();
  const inhalt = testInhalt({
    abschnitte: [testAbschnitt({ laufzettel: [a, b] }), testAbschnitt({ laufzettel: [c] })],
  });

  it('nummeriert fortlaufend über die Abschnitte ab 1', () => {
    const nummern = laufzettelNummern(inhalt);
    expect([nummern.get(a.id), nummern.get(b.id), nummern.get(c.id)]).toEqual([1, 2, 3]);
  });

  it('liefert nur zu volle Laufzettel in Reihenfolge', () => {
    expect(zuVolleLaufzettel(inhalt).map((l) => l.id)).toEqual([b.id]);
    expect(zuVolleLaufzettel(testInhalt({ abschnitte: [] }))).toEqual([]);
  });
});

describe('ueberlaufPositionen', () => {
  it('liefert nichts, solange der Laufzettel passt', () => {
    expect(ueberlaufPositionen(mitPositionen(23))).toEqual([]);
  });

  it('liefert die Positionen hinter der letzten passenden', () => {
    const laufzettel = mitPositionen(26);
    const ids = ueberlaufPositionen(laufzettel).join();
    expect(ids).toBe(
      laufzettel.positionen
        .slice(23)
        .map((p) => p.id)
        .join(),
    );
  });

  it('lässt mindestens eine Position im ersten Laufzettel', () => {
    const laufzettel = testLaufzettel({
      lagerort: '',
      transportMit: '',
      auftraggeber: '',
      positionen: [testPosition({ material: 'z'.repeat(38 * 24) }), testPosition()],
    });
    expect(ueberlaufPositionen(laufzettel)).toEqual([laufzettel.positionen[1].id]);
  });
});

describe('laufzettelMasse', () => {
  it('behält bei drei Streifen die bisherigen Werte', () => {
    expect(laufzettelMasse(3)).toEqual({
      streifenJeSeite: 3,
      zeichenJeZeile: 38,
      zeichenJeZielzeile: 34,
      zeichenJeInfozeile: 44,
    });
  });

  it('wird mit schmaleren Streifen monoton enger und erreicht bei sechs etwa 13 Zeichen', () => {
    const zeichen = [3, 4, 5, 6].map((n) => laufzettelMasse(n).zeichenJeZeile);
    expect(zeichen).toEqual([...zeichen].sort((a, b) => b - a));
    expect(new Set(zeichen).size).toBe(4);
    expect(laufzettelMasse(6).zeichenJeZeile).toBe(13);
    expect(laufzettelMasse(6).zeichenJeZielzeile).toBeGreaterThan(8);
  });

  it('begrenzt die Streifenzahl auf 3 bis 6 und fällt bei Unsinn auf die Vorgabe', () => {
    expect(gueltigeStreifenZahl(2)).toBe(3);
    expect(gueltigeStreifenZahl(9)).toBe(6);
    expect(gueltigeStreifenZahl(4.4)).toBe(4);
    expect(gueltigeStreifenZahl(Number.NaN)).toBe(STREIFEN_STANDARD);
    expect(STREIFEN_STANDARD).toBe(6);
  });
});

describe('laufzettelPlatz je Layout', () => {
  const lz = (material: string) =>
    testLaufzettel({
      positionen: [testPosition({ material })],
      lagerort: '',
      transportMit: '',
      auftraggeber: '',
    });

  it('belegt denselben Text auf schmalen Streifen mehr Zeilen, das Limit bleibt 23', () => {
    const text = 'x'.repeat(30);
    expect(platzMit(lz(text), 3).belegt).toBe(1);
    expect(platzMit(lz(text), 6).belegt).toBe(3);
    expect(platzMit(lz(text), 6).kapazitaet).toBe(23);
  });

  it('meldet auf sechs Streifen früher „zu voll“ als auf dreien', () => {
    const viele = testLaufzettel({
      positionen: Array.from({ length: 12 }, () => testPosition({ material: 'x'.repeat(30) })),
      lagerort: '',
      transportMit: '',
      auftraggeber: '',
    });
    expect(platzMit(viele, 3).zustand).toBe('ok');
    expect(platzMit(viele, 6).zustand).toBe('zu-voll');
    const ueberlauf = ueberlaufMit(viele, 6);
    expect(ueberlauf.length).toBeGreaterThan(0);
    expect(ueberlaufMit(viele, 3)).toEqual([]);
    expect(
      zuVolleMit(testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [viele] })] }), 6),
    ).toHaveLength(1);
  });
});
