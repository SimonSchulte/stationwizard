import { describe, expect, it } from 'vitest';
import { istZeichnungBrauchbar, pruefeUnterschrift } from './unterschrift.model';

describe('pruefeUnterschrift', () => {
  it('nimmt Schrift und Zeichnung an', () => {
    expect(pruefeUnterschrift({ art: 'schrift', text: ' Max ', font: 'Caveat' })).toEqual({
      art: 'schrift',
      text: 'Max',
      font: 'Caveat',
    });
    const zeichnung = {
      art: 'zeichnung',
      striche: [
        [
          [0, 0],
          [480, 160],
        ],
      ],
    };
    expect(pruefeUnterschrift(zeichnung)).toEqual(zeichnung);
  });

  it.each([
    ['null', null],
    ['Liste', []],
    ['unbekannte Art', { art: 'bild' }],
    ['zusätzliches Feld', { art: 'schrift', text: 'a', font: 'Caveat', x: 1 }],
    ['fremde Schrift', { art: 'schrift', text: 'a', font: 'Arial' }],
    ['leerer Text', { art: 'schrift', text: ' ', font: 'Caveat' }],
    ['Punkt außerhalb', { art: 'zeichnung', striche: [[[481, 1]]] }],
    ['Kommazahl', { art: 'zeichnung', striche: [[[1.2, 1]]] }],
    ['keine Striche', { art: 'zeichnung', striche: [] }],
  ])('lehnt %s ab', (_name, wert) => {
    expect(pruefeUnterschrift(wert)).toBeNull();
  });
});

describe('istZeichnungBrauchbar', () => {
  it('verlangt einen Strich mit mindestens zwei Punkten', () => {
    expect(istZeichnungBrauchbar([])).toBe(false);
    expect(istZeichnungBrauchbar([[[1, 1]]])).toBe(false);
    expect(
      istZeichnungBrauchbar([
        [
          [1, 1],
          [2, 2],
        ],
      ]),
    ).toBe(true);
  });
});
