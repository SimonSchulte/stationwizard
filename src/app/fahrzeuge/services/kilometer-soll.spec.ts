import { describe, expect, it } from 'vitest';
import { berechneJahresbilanz, ermittleJahresstartstand, sollKmProJahr } from './kilometer-soll';
import { erzeugeTestablesung, erzeugeTestfahrzeug } from '../testing/fahrzeug-testdaten';

describe('sollKmProJahr', () => {
  it('rechnet Land NRW mit 150 km pro Monat, also 1800 km im Jahr', () => {
    expect(sollKmProJahr('land-nrw')).toBe(1800);
  });

  it('rechnet Bund mit 50 km pro Monat, also 600 km im Jahr', () => {
    expect(sollKmProJahr('bund')).toBe(600);
  });

  it('kennt für Organisation keine Vorgabe', () => {
    expect(sollKmProJahr('organisation')).toBe(0);
  });
});

describe('ermittleJahresstartstand', () => {
  it('nimmt die letzte Ablesung des Vorjahres, wenn vorhanden', () => {
    const ablesungen = [
      erzeugeTestablesung({ abgelesenAm: '2025-11-01', stand: 8000 }),
      erzeugeTestablesung({ abgelesenAm: '2025-12-20', stand: 9500 }),
      erzeugeTestablesung({ abgelesenAm: '2026-03-01', stand: 10_500 }),
    ];
    const ergebnis = ermittleJahresstartstand(ablesungen, 2026);
    expect(ergebnis).toEqual({ stand: 9500, unvollstaendig: false });
  });

  it('fällt ohne Vorjahresablesung auf die erste Ablesung des Jahres zurück und markiert unvollständig', () => {
    const ablesungen = [
      erzeugeTestablesung({ abgelesenAm: '2026-04-10', stand: 12_000 }),
      erzeugeTestablesung({ abgelesenAm: '2026-02-01', stand: 11_000 }),
    ];
    const ergebnis = ermittleJahresstartstand(ablesungen, 2026);
    expect(ergebnis).toEqual({ stand: 11_000, unvollstaendig: true });
  });

  it('liefert null ohne jede Ablesung', () => {
    expect(ermittleJahresstartstand([], 2026)).toEqual({ stand: null, unvollstaendig: true });
  });

  it('behandelt den Jahreswechsel exakt: 31.12. zählt zum Vorjahr, 1.1. zum neuen Jahr', () => {
    const ablesungen = [
      erzeugeTestablesung({ abgelesenAm: '2025-12-31', stand: 5000 }),
      erzeugeTestablesung({ abgelesenAm: '2026-01-01', stand: 5010 }),
    ];
    expect(ermittleJahresstartstand(ablesungen, 2026)).toEqual({
      stand: 5000,
      unvollstaendig: false,
    });
  });
});

describe('berechneJahresbilanz', () => {
  it('berechnet Restkilometer für ein Land-NRW-Fahrzeug mit vollständiger Datenlage', () => {
    const fahrzeug = erzeugeTestfahrzeug({ eigentuemer: 'land-nrw' });
    const ablesungen = [
      erzeugeTestablesung({ abgelesenAm: '2025-12-31', stand: 10_000 }),
      erzeugeTestablesung({ abgelesenAm: '2026-06-01', stand: 10_900 }),
    ];
    const bilanz = berechneJahresbilanz(fahrzeug, ablesungen, 2026);
    expect(bilanz.sollKm).toBe(1800);
    expect(bilanz.istKm).toBe(900);
    expect(bilanz.restKm).toBe(900);
    expect(bilanz.unvollstaendig).toBe(false);
  });

  it('zeigt für Organisation kein Soll und kein Rest an, ohne falsche Erfolgsmeldung', () => {
    const fahrzeug = erzeugeTestfahrzeug({ eigentuemer: 'organisation' });
    const ablesungen = [erzeugeTestablesung({ abgelesenAm: '2026-06-01', stand: 5000 })];
    const bilanz = berechneJahresbilanz(fahrzeug, ablesungen, 2026);
    expect(bilanz.sollKm).toBe(0);
    expect(bilanz.restKm).toBe(0);
  });

  it('liefert null statt einer falschen Zahl, wenn kein Jahresstartstand bekannt ist', () => {
    const fahrzeug = erzeugeTestfahrzeug({ eigentuemer: 'bund' });
    const bilanz = berechneJahresbilanz(fahrzeug, [], 2026);
    expect(bilanz.istKm).toBeNull();
    expect(bilanz.restKm).toBeNull();
    expect(bilanz.unvollstaendig).toBe(true);
  });

  it('kappt das Restkilometer nicht negativ, wenn das Soll bereits übererfüllt ist', () => {
    const fahrzeug = erzeugeTestfahrzeug({ eigentuemer: 'bund' });
    const ablesungen = [
      erzeugeTestablesung({ abgelesenAm: '2025-12-31', stand: 1000 }),
      erzeugeTestablesung({ abgelesenAm: '2026-06-01', stand: 3000 }),
    ];
    const bilanz = berechneJahresbilanz(fahrzeug, ablesungen, 2026);
    expect(bilanz.istKm).toBe(2000);
    expect(bilanz.restKm).toBe(0);
  });
});
