import { describe, expect, it } from 'vitest';
import { testAbschnitt, testInhalt, testLaufzettel } from '../testing/vb-testdaten';
import { vbAbgleich } from './vb-abgleich';
import { kopiereVorlage } from './vb-kopie';
import { laufzettelMarken } from './vb-marken';

describe('laufzettelMarken', () => {
  it('markiert neue und geänderte Laufzettel, unveränderte nicht', () => {
    const vorlage = testInhalt({
      abschnitte: [testAbschnitt({ laufzettel: [testLaufzettel(), testLaufzettel()] })],
    });
    const vb = kopiereVorlage({ id: crypto.randomUUID(), titel: 'V', inhalt: vorlage }, 1).inhalt;
    const [unveraendert, geaendert] = vb.abschnitte[0].laufzettel;
    geaendert.lagerort = 'Woanders';
    const neu = testLaufzettel();
    vb.abschnitte[0].laufzettel.push(neu);

    const marken = laufzettelMarken(vb, vbAbgleich(vorlage, vb));
    expect(marken.get(geaendert.id)).toBe('geaendert');
    expect(marken.get(neu.id)).toBe('neu');
    expect(marken.has(unveraendert.id)).toBe(false);
  });

  it('liefert für eine frische Kopie keine Marken', () => {
    const vorlage = testInhalt();
    const vb = kopiereVorlage({ id: crypto.randomUUID(), titel: 'V', inhalt: vorlage }, 1).inhalt;
    expect(laufzettelMarken(vb, vbAbgleich(vorlage, vb)).size).toBe(0);
  });
});
