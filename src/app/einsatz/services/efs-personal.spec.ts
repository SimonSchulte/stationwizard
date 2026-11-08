import { describe, expect, it } from 'vitest';
import type { Einsatzkraft } from '../models/planung.model';
import { vergleichePersonal } from './efs-personal';

const kraft = (id: string, name: string): Einsatzkraft => ({ id, name, tags: {} });

describe('vergleichePersonal', () => {
  it('trennt neue, entfallene und unveränderte Einsatzkräfte über den Namen', () => {
    const ergebnis = vergleichePersonal(
      [kraft('1', 'Muster Anna'), kraft('2', 'Beispiel Jonas'), kraft('3', 'Demo Paul')],
      [kraft('a', 'muster anna'), kraft('b', 'Beispiel Jonas'), kraft('c', 'Probst Noah')],
    );
    expect(ergebnis.neu.map((e) => e.name)).toEqual(['Probst Noah']);
    expect(ergebnis.entfallen.map((e) => e.name)).toEqual(['Demo Paul']);
    expect(ergebnis.unveraendert).toBe(2);
  });

  it('erkennt Umlaute unabhängig von der Schreibweise und zählt Doppelte aus EFS einmal', () => {
    const ergebnis = vergleichePersonal(
      [kraft('1', 'Müller Jan')],
      [kraft('a', 'Mueller Jan'), kraft('b', 'Neu Eva'), kraft('c', 'Neu  Eva')],
    );
    expect(ergebnis.neu.map((e) => e.name)).toEqual(['Neu Eva']);
    expect(ergebnis.unveraendert).toBe(1);
  });
});
