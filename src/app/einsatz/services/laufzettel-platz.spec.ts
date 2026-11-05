import { describe, expect, it } from 'vitest';
import { testAbschnitt, testInhalt, testLaufzettel, testPosition } from '../testing/vb-testdaten';
import {
  LAUFZETTEL_KAPAZITAET,
  ZEICHEN_JE_INFOZEILE,
  ZEICHEN_JE_ZEILE,
  ZEICHEN_JE_ZIELZEILE,
  laufzettelNummern,
  laufzettelPlatz,
  ueberlaufPositionen,
  zuVolleLaufzettel,
} from './laufzettel-platz';

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
