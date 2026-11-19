import { describe, expect, it } from 'vitest';
import { aehnlichkeit, besterTreffer } from './name-abgleich';

describe('name-abgleich', () => {
  it('erkennt Einzahl und Mehrzahl als gleich', () => {
    expect(aehnlichkeit('Drehstromkabeltrommel 400V', 'Drehstromkabeltrommeln 400V')).toBe(1);
    expect(aehnlichkeit('Verlängerungsleitung 230V 10m', 'Verlängerungsleitungen 230V 10m')).toBe(
      1,
    );
  });

  it('findet Lager mit Zusätzen und umgestellte Wörter', () => {
    expect(
      besterTreffer('GW-Technik', [{ name: '72 GW-Technik 01' }, { name: 'Kaltlager' }]),
    ).toEqual({
      name: '72 GW-Technik 01',
    });
    expect(besterTreffer('Küchenlager', [{ name: 'Lager Küche' }, { name: 'Kaltlager' }])).toEqual({
      name: 'Lager Küche',
    });
  });

  it('belegt nicht Verschiedenes vor', () => {
    expect(
      besterTreffer('Stehtische', [{ name: 'Biertische, Breit' }, { name: 'Leiter' }]),
    ).toBeUndefined();
    expect(besterTreffer('Besen', [{ name: 'Besen, Handfeger, Kehrblech' }])).toBeDefined();
  });

  it('rangiert Ähnliches höher', () => {
    expect(aehnlichkeit('Propanflaschen', 'Propangasflasche')).toBeGreaterThan(
      aehnlichkeit('Propanflaschen', 'Leiter'),
    );
  });
});
