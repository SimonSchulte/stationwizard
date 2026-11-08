import { describe, expect, it } from 'vitest';
import type { Einsatzkraft, Planung, Position } from '../models/planung.model';
import { MatchService } from './match.service';
import {
  offeneAnforderungen,
  passendeOffenePosition,
  poolHinweise,
  vorschlaegeFuerPosition,
} from './vorschlaege';

const abgleich = (p: Position, e: Einsatzkraft) => new MatchService().matchLevel(p, e);

function kraft(id: string, name: string, tags: Einsatzkraft['tags'] = {}): Einsatzkraft {
  return { id, name, tags };
}

function position(
  id: string,
  anforderung: Position['requirements'],
  besetzt: Einsatzkraft | null = null,
): Position {
  return {
    id,
    label: `Position ${id}`,
    requirements: anforderung,
    assigned: besetzt ? { id: besetzt.id, name: besetzt.name } : null,
  };
}

const KEINE = { taktisch: null, medizinisch: null } as const;

const mia = kraft('mia', 'Beispiel Mia', { taktisch: ['GF'], medizinisch: ['RS'] });
const noah = kraft('noah', 'Probst Noah', { medizinisch: ['NotSan'] });
const lena = kraft('lena', 'Muster Lena', { medizinisch: ['SanH'] });
const paul = kraft('paul', 'Demo Paul', { medizinisch: ['EH'] });

function planung(posten: Planung['posten'], einsatzkraefte: Einsatzkraft[]): Planung {
  return {
    id: 'p',
    name: 'Test',
    start: '2026-12-12T13:00:00.000Z',
    end: '2026-12-13T00:00:00.000Z',
    posten,
    einsatzkraefte,
    einsatzleiter: null,
  };
}

describe('vorschlaegeFuerPosition', () => {
  it('nennt vollständig passende vor teilweise passenden und lässt Unpassende weg', () => {
    const ziel = position('1', { taktisch: 'GF', medizinisch: 'RS' });
    const nurRs = kraft('rs', 'Alpha Rs', { medizinisch: ['RS'] });
    const treffer = vorschlaegeFuerPosition(ziel, [paul, nurRs, mia], abgleich);
    expect(treffer.map((t) => [t.einsatzkraft.id, t.eignung])).toEqual([
      ['mia', 'full'],
      ['rs', 'partial'],
    ]);
  });

  it('begrenzt die Anzahl und sortiert gleich geeignete nach Name', () => {
    const ziel = position('1', { taktisch: null, medizinisch: 'EH' });
    const viele = ['d', 'c', 'b', 'a'].map((n) => kraft(n, `Name ${n}`, { medizinisch: ['EH'] }));
    expect(vorschlaegeFuerPosition(ziel, viele, abgleich, 2).map((t) => t.einsatzkraft.id)).toEqual(
      ['a', 'b'],
    );
  });
});

describe('passendeOffenePosition und poolHinweise', () => {
  const offenRs = position('rs', { taktisch: null, medizinisch: 'RS' });
  const frei = position('frei', KEINE);
  const besetzt = position('b', { taktisch: null, medizinisch: 'EH' }, paul);
  const p = planung(
    [{ id: 'a', label: 'Wache', fahrzeug: null, positions: [frei, offenRs, besetzt] }],
    [mia, noah, lena, paul],
  );

  it('ignoriert Positionen ohne Anforderung und besetzte Positionen', () => {
    expect(passendeOffenePosition(mia, p, abgleich)).toEqual({
      postenLabel: 'Wache',
      positionLabel: 'Position rs',
    });
    expect(passendeOffenePosition(lena, p, abgleich)).toBeNull();
  });

  it('hinterlegt für Verfügbare den passenden Platz und für Eingeteilte ihren Platz', () => {
    const h = poolHinweise(p, [mia, noah, lena], abgleich);
    expect(h.get('mia')).toEqual({ art: 'passt', text: 'Passt: Position rs' });
    expect(h.has('lena')).toBe(false);
    expect(h.get('paul')).toEqual({ art: 'eingeteilt', text: 'Wache · Position b' });
  });
});

describe('offeneAnforderungen', () => {
  it('gruppiert offene Positionen, markiert Lücken und stellt sie voran', () => {
    const p = planung(
      [
        {
          id: 'a',
          label: 'Wagen',
          fahrzeug: null,
          positions: [
            position('1', { taktisch: null, medizinisch: 'NotSan' }),
            position('2', { taktisch: null, medizinisch: 'SanH' }),
            position('3', { taktisch: null, medizinisch: 'SanH' }),
            position('4', KEINE),
            position('5', { taktisch: null, medizinisch: 'EH' }, paul),
          ],
        },
      ],
      [lena, paul],
    );
    expect(offeneAnforderungen(p, [lena], abgleich)).toEqual([
      { bezeichnung: 'NotSan', anzahl: 1, luecke: true },
      { bezeichnung: 'SanH', anzahl: 2, luecke: false },
    ]);
  });
});
