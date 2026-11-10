import { describe, expect, it } from 'vitest';
import { lagerSchluessel, lagerVorschlaege } from './lager';

describe('lagerSchluessel', () => {
  it('ignoriert Groß-/Kleinschreibung und überzählige Leerzeichen', () => {
    expect(lagerSchluessel('  Lager   NORD ')).toBe('lager nord');
  });
});

describe('lagerVorschlaege', () => {
  const abschnitt = (...lager: string[]) => ({
    laufzettel: lager.map((lagerort) => ({ lagerort })),
  });

  it('nennt jedes Lager einmal, in der ersten Schreibweise, alphabetisch', () => {
    const liste = lagerVorschlaege([
      abschnitt('Lager Süd', 'lager  nord'),
      abschnitt('Lager Nord', 'Fahrzeughalle'),
    ]);
    expect(liste).toEqual(['Fahrzeughalle', 'lager nord', 'Lager Süd']);
  });

  it('lässt leere und nur aus Leerzeichen bestehende Lager weg', () => {
    expect(lagerVorschlaege([abschnitt('', '  ', 'Halle')])).toEqual(['Halle']);
    expect(lagerVorschlaege([])).toEqual([]);
  });
});
