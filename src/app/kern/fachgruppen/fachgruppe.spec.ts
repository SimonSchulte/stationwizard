import { describe, expect, it } from 'vitest';
import {
  FACHGRUPPEN,
  FACHGRUPPE_BEZEICHNUNG,
  FACHGRUPPE_FARBVARIABLE,
  istFachgruppe,
} from './fachgruppe';

describe('Fachgruppe', () => {
  it('führt die fünf Gruppen in fester Reihenfolge', () => {
    expect(FACHGRUPPEN).toEqual(['sanitaet', 'betreuung', 'verpflegung', 'tesi', 'fuehrung']);
  });

  it('hat zu jeder Gruppe Bezeichnung und Farbvariable', () => {
    for (const gruppe of FACHGRUPPEN) {
      expect(FACHGRUPPE_BEZEICHNUNG[gruppe].length).toBeGreaterThan(0);
      expect(FACHGRUPPE_FARBVARIABLE[gruppe]).toMatch(/^--kat-/);
    }
    expect(FACHGRUPPE_BEZEICHNUNG.tesi).toBe('TeSi');
    expect(FACHGRUPPE_FARBVARIABLE.verpflegung).toBe(FACHGRUPPE_FARBVARIABLE.betreuung);
  });

  it('erkennt nur bekannte Werte', () => {
    expect(istFachgruppe('tesi')).toBe(true);
    expect(istFachgruppe('Tesi')).toBe(false);
    expect(istFachgruppe(null)).toBe(false);
    expect(istFachgruppe(3)).toBe(false);
  });
});
