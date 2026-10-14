import { describe, expect, it } from 'vitest';
import { gruppenSammeln, passtZuGruppen } from './gruppen';

describe('Gruppenfilter', () => {
  it('sammelt gefundene Gruppen einmalig und sortiert', () => {
    expect(
      gruppenSammeln([
        { gruppen: ['Sanität', 'Betreuung'] },
        { gruppen: ['Sanität', ' '] },
        { gruppen: [] },
      ]),
    ).toEqual(['Betreuung', 'Sanität']);
  });

  it('lässt bei leerer Auswahl alle durch, sonst genügt eine passende Gruppe', () => {
    expect(passtZuGruppen([], [])).toBe(true);
    expect(passtZuGruppen(['Sanität'], ['Betreuung', 'Sanität'])).toBe(true);
    expect(passtZuGruppen(['Sanität'], ['Betreuung'])).toBe(false);
    expect(passtZuGruppen([], ['Betreuung'])).toBe(false);
  });
});
