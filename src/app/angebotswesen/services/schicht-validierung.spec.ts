import { describe, expect, it } from 'vitest';
import type { Angebot, Position, Schicht } from '../models/angebot.model';
import { angebotProbleme, istGueltigeSchichtzeit } from './schicht-validierung';

describe('istGueltigeSchichtzeit', () => {
  it('akzeptiert eine gültige Spanne', () => {
    expect(istGueltigeSchichtzeit('08:00', '20:00')).toBe(true);
  });

  it('lehnt bis === von ab', () => {
    expect(istGueltigeSchichtzeit('08:00', '08:00')).toBe(false);
  });

  it('lehnt bis < von ab (kein Tagesüberlauf)', () => {
    expect(istGueltigeSchichtzeit('20:00', '08:00')).toBe(false);
  });

  it('lehnt eine Uhrzeit mit Stunde 24 ab', () => {
    expect(istGueltigeSchichtzeit('08:00', '24:00')).toBe(false);
  });

  it('lehnt ein ungültiges Format ab', () => {
    expect(istGueltigeSchichtzeit('08:00', 'abc')).toBe(false);
    expect(istGueltigeSchichtzeit('abc', '20:00')).toBe(false);
  });
});

describe('angebotProbleme', () => {
  const position = (patch: Partial<Position> = {}): Position => ({
    id: 'p1',
    herkunftEintragId: null,
    art: 'einsatzkraft',
    bezeichnung: 'Erfundener Sanitäter',
    einzelpreisCent: 1800,
    anzahl: 2,
    stunden: 8,
    ...patch,
  });
  const angebot = (positionen: Position[], patch: Partial<Schicht> = {}): Angebot => ({
    id: 'a1',
    bezeichnung: 'Erfundenes Angebot',
    auftraggeber: '',
    bemerkung: '',
    schichten: [
      { id: 's1', datum: '2026-12-12', von: '10:00', bis: '18:00', positionen, ...patch },
    ],
    materialpauschaleAktiv: false,
    materialpauschaleCent: null,
    pauschalpreisAktiv: false,
    pauschalpreisCent: null,
    geaendertAm: '',
    geaendertVon: '',
  });

  it('lässt ein vollständiges Angebot durch', () => {
    expect(angebotProbleme(angebot([position()]))).toEqual([]);
  });

  it('verlangt eine Bezeichnung je Position', () => {
    expect(angebotProbleme(angebot([position({ bezeichnung: '  ' })]))).toEqual([
      'Schicht 1, Position 1: Eine Bezeichnung fehlt.',
    ]);
  });

  it('prüft Anzahl, Preis und Stunden', () => {
    const probleme = angebotProbleme(
      angebot([position({ anzahl: 0, einzelpreisCent: -1, stunden: 0 })]),
    );
    expect(probleme).toHaveLength(3);
  });

  it('verlangt Stunden nur bei Einsatzkräften, nicht bei Fahrzeugen', () => {
    expect(angebotProbleme(angebot([position({ art: 'fahrzeug', stunden: null })]))).toEqual([]);
  });

  it('meldet eine ungültige Schichtzeit', () => {
    expect(angebotProbleme(angebot([], { von: '18:00', bis: '10:00' }))).toEqual([
      'Schicht 1: Die Zeitspanne ist ungültig (Ende nach Beginn).',
    ]);
  });
});
