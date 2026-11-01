import { describe, expect, it } from 'vitest';
import { Planung, Position, Posten, Taktisch } from '../models/planung.model';
import { planungIst, planungSoll, postenIst, postenSoll, staerkeStatus } from './staerke';

function position(taktisch: Taktisch | null, besetzt: boolean): Position {
  return {
    id: crypto.randomUUID(),
    label: 'Position',
    requirements: { taktisch, medizinisch: null },
    assigned: besetzt ? { id: 'ek', name: 'Erfunden Person' } : null,
  };
}

function posten(...positionen: Position[]): Posten {
  return { id: crypto.randomUUID(), label: 'Posten', fahrzeug: null, positions: positionen };
}

describe('Stärke', () => {
  const zugtrupp = posten(position('ZF', true), position('GF', false), position('H', true));
  const sanitaet = posten(position(null, true), position('VF', false));

  it('zählt das Soll nach der Anforderung der Position', () => {
    expect(postenSoll(zugtrupp)).toEqual({ fuhrer: 1, unterfuehrer: 1, helfer: 1, gesamt: 3 });
  });

  it('zählt im Ist nur besetzte Positionen', () => {
    expect(postenIst(zugtrupp)).toEqual({ fuhrer: 1, unterfuehrer: 0, helfer: 1, gesamt: 2 });
  });

  it('summiert über alle Posten einer Planung', () => {
    const planung = { posten: [zugtrupp, sanitaet] } as Planung;
    expect(planungSoll(planung)).toEqual({ fuhrer: 2, unterfuehrer: 1, helfer: 2, gesamt: 5 });
    expect(planungIst(planung)).toEqual({ fuhrer: 1, unterfuehrer: 0, helfer: 2, gesamt: 3 });
  });

  it('bewertet Ist gegen Soll', () => {
    expect(staerkeStatus(0, 0)).toBe('status-neutral');
    expect(staerkeStatus(1, 2)).toBe('status-under');
    expect(staerkeStatus(3, 2)).toBe('status-over');
    expect(staerkeStatus(2, 2)).toBe('status-met');
  });
});
