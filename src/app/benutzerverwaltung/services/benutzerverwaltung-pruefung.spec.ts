import { describe, expect, it } from 'vitest';
import { Benutzerkonto } from '../models/benutzerkonto.model';
import { istBenutzerkonto, istHauptrolle, istSonderrolle } from './benutzerverwaltung-pruefung';

function testkonto(ueberschreibung: Partial<Benutzerkonto> = {}): Benutzerkonto {
  return {
    email: 'person@example.test',
    rolle: null,
    sonderrollen: [],
    ersterZugriffAm: '2026-01-01T00:00:00.000Z',
    letzterZugriffAm: '2026-01-02T00:00:00.000Z',
    rolleGeaendertAm: null,
    rolleGeaendertVon: null,
    ...ueberschreibung,
  };
}

describe('istHauptrolle', () => {
  it('erkennt gültige Hauptrollen', () => {
    expect(istHauptrolle('helfer')).toBe(true);
    expect(istHauptrolle('zugfuehrung')).toBe(true);
  });

  it('lehnt Unbekanntes ab', () => {
    expect(istHauptrolle('erfunden')).toBe(false);
    expect(istHauptrolle(null)).toBe(false);
  });
});

describe('istSonderrolle', () => {
  it('erkennt Verwaltungshelfer', () => {
    expect(istSonderrolle('verwaltungshelfer')).toBe(true);
  });

  it('lehnt Unbekanntes ab', () => {
    expect(istSonderrolle('admin')).toBe(false);
  });
});

describe('istBenutzerkonto', () => {
  it('akzeptiert ein vollständiges Konto ohne Rolle', () => {
    expect(istBenutzerkonto(testkonto())).toBe(true);
  });

  it('akzeptiert Hauptrolle und Sonderrollen kombiniert', () => {
    expect(
      istBenutzerkonto(
        testkonto({
          rolle: 'zugfuehrung',
          sonderrollen: ['verwaltungshelfer'],
          rolleGeaendertAm: '2026-01-03T00:00:00.000Z',
          rolleGeaendertVon: 'admin@example.test',
        }),
      ),
    ).toBe(true);
  });

  it('lehnt eine unbekannte Rolle ab', () => {
    expect(istBenutzerkonto({ ...testkonto(), rolle: 'erfunden' })).toBe(false);
  });

  it('lehnt eine fehlende E-Mail-Adresse ab', () => {
    expect(istBenutzerkonto({ ...testkonto(), email: '' })).toBe(false);
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(istBenutzerkonto(null)).toBe(false);
    expect(istBenutzerkonto('text')).toBe(false);
  });
});
