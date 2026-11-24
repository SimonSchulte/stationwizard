import { describe, expect, it } from 'vitest';
import { ampelKlasse, ermittleLeitTermin, tageBisFaelligText } from './ampel-anzeige';
import { erzeugeTestfahrzeug, erzeugeTestwartung } from '../testing/fahrzeug-testdaten';

describe('ampelKlasse', () => {
  it.each([
    ['rot', 'rot'],
    ['ueberfaellig', 'rot'],
    ['gelb', 'gelb'],
    ['warnung', 'gelb'],
    ['gruen', 'gruen'],
    ['ok', 'gruen'],
    ['erledigt', 'gruen'],
    [null, 'neutral'],
  ] as const)('ordnet %s der Farbe %s zu', (eingabe, erwartet) => {
    expect(ampelKlasse(eingabe)).toBe(erwartet);
  });
});

describe('tageBisFaelligText', () => {
  it('nennt überfällige, heutige und künftige Termine', () => {
    expect(tageBisFaelligText(-3)).toBe('3 Tage überfällig');
    expect(tageBisFaelligText(0)).toBe('heute fällig');
    expect(tageBisFaelligText(23)).toBe('in 23 Tagen fällig');
  });
});

describe('ermittleLeitTermin', () => {
  it('liefert einen Platzhalter, wenn kein Termin offen ist', () => {
    const fahrzeug = erzeugeTestfahrzeug({ wartungstermine: [] });
    expect(ermittleLeitTermin(fahrzeug.wartungstermine, '2026-11-24')).toEqual({
      bezeichnung: 'Keine offenen Termine',
      ampel: null,
      text: '',
    });
  });

  it('wählt den am frühesten fälligen offenen Termin', () => {
    const fahrzeug = erzeugeTestfahrzeug({
      wartungstermine: [
        erzeugeTestwartung({ bezeichnung: 'Spät', faelligAm: '2027-05-01' }),
        erzeugeTestwartung({
          bezeichnung: 'Hauptuntersuchung',
          art: 'hu',
          faelligAm: '2026-12-01',
        }),
        erzeugeTestwartung({
          bezeichnung: 'Erledigt',
          faelligAm: '2026-11-01',
          erledigtAm: '2026-11-02',
        }),
      ],
    });
    const leit = ermittleLeitTermin(fahrzeug.wartungstermine, '2026-11-24');
    expect(leit.bezeichnung).toBe('Hauptuntersuchung');
    expect(leit.text).toBe('in 7 Tagen fällig');
  });
});
