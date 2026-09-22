import { describe, expect, it } from 'vitest';
import {
  berechneJahresbilanz,
  ermittleJahresstartstand,
  ermittleKilometerAmpel,
  restmonateImJahr,
  sollKmProJahr,
} from './kilometer-soll';
import { erzeugeTestablesung, erzeugeTestfahrzeug } from '../testing/fahrzeug-testdaten';

const SCHWELLENWERTE = { gelbMonate: 1, rotMonate: 3 };

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

  it('behandelt eine nachgetragene Ablesung genau vom 1.1. als vollwertigen Startstand', () => {
    const ablesungen = [
      erzeugeTestablesung({ abgelesenAm: '2026-01-01', stand: 8000 }),
      erzeugeTestablesung({ abgelesenAm: '2026-06-01', stand: 8300 }),
    ];
    expect(ermittleJahresstartstand(ablesungen, 2026)).toEqual({
      stand: 8000,
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

describe('restmonateImJahr', () => {
  it('zählt den Monat des Stichtags noch mit', () => {
    expect(restmonateImJahr('2026-09-22', 2026)).toBe(4);
    expect(restmonateImJahr('2026-01-01', 2026)).toBe(12);
    expect(restmonateImJahr('2026-12-15', 2026)).toBe(1);
  });

  it('liefert 0 für ein bereits vollständig verstrichenes Bilanzjahr', () => {
    expect(restmonateImJahr('2026-09-22', 2025)).toBe(0);
  });

  it('liefert 12 für ein noch nicht begonnenes Bilanzjahr', () => {
    expect(restmonateImJahr('2026-09-22', 2027)).toBe(12);
  });
});

describe('ermittleKilometerAmpel', () => {
  const fahrzeug = erzeugeTestfahrzeug({ eigentuemer: 'land-nrw' });

  /** `sollKm` ist bei `land-nrw` 1800; `istKm` wird so gewählt, dass genau `restKm` übrig bleibt. */
  function bilanzMitRestKm(restKm: number) {
    const istKm = 1800 - restKm;
    return berechneJahresbilanz(
      fahrzeug,
      [
        erzeugeTestablesung({ abgelesenAm: '2025-12-31', stand: 10_000 }),
        erzeugeTestablesung({ abgelesenAm: '2026-06-01', stand: 10_000 + istKm }),
      ],
      2026,
    );
  }

  it('zeigt keine Ampel ohne Vorgabe', () => {
    const organisation = erzeugeTestfahrzeug({ eigentuemer: 'organisation' });
    const bilanz = berechneJahresbilanz(organisation, [], 2026);
    expect(ermittleKilometerAmpel(bilanz, 6, SCHWELLENWERTE)).toBeNull();
  });

  it('zeigt keine Ampel ohne berechenbaren Startstand', () => {
    const bilanz = berechneJahresbilanz(fahrzeug, [], 2026);
    expect(ermittleKilometerAmpel(bilanz, 6, SCHWELLENWERTE)).toBeNull();
  });

  it('ist grün, solange die Rest-km beim Mindesttempo der Restmonate noch passen', () => {
    // 150 km/Monat, 6 Restmonate → 900 km ist die reine Grenze ohne Puffer.
    const bilanz = bilanzMitRestKm(900);
    expect(ermittleKilometerAmpel(bilanz, 6, SCHWELLENWERTE)).toBe('gruen');
  });

  it('bleibt innerhalb des Gelb-Puffers noch grün', () => {
    // 900 (Grenze) + 1 Monat Puffer à 150 km = 1050 km sind noch grün.
    const bilanz = bilanzMitRestKm(1050);
    expect(ermittleKilometerAmpel(bilanz, 6, SCHWELLENWERTE)).toBe('gruen');
  });

  it('wird gelb, sobald der Gelb-Puffer überschritten ist', () => {
    const bilanz = bilanzMitRestKm(1051);
    expect(ermittleKilometerAmpel(bilanz, 6, SCHWELLENWERTE)).toBe('gelb');
  });

  it('bleibt bis zum Rot-Puffer gelb', () => {
    // 900 + 3 Monate Puffer à 150 km = 1350 km sind noch gelb.
    const bilanz = bilanzMitRestKm(1350);
    expect(ermittleKilometerAmpel(bilanz, 6, SCHWELLENWERTE)).toBe('gelb');
  });

  it('wird rot, sobald auch der Rot-Puffer überschritten ist', () => {
    const bilanz = bilanzMitRestKm(1351);
    expect(ermittleKilometerAmpel(bilanz, 6, SCHWELLENWERTE)).toBe('rot');
  });

  it('ist grün, wenn das Jahressoll bereits erreicht ist', () => {
    const bilanz = bilanzMitRestKm(0);
    expect(ermittleKilometerAmpel(bilanz, 1, SCHWELLENWERTE)).toBe('gruen');
  });
});
