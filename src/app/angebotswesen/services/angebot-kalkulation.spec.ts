import { describe, expect, it } from 'vitest';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../testing/angebot-testdaten';
import {
  angebotGesamtCent,
  angebotRechnerischGesamtCent,
  berechneAngebot,
  positionGesamtCent,
  schichtGesamtCent,
  schichtStundenGenau,
} from './angebot-kalkulation';

describe('schichtStundenGenau', () => {
  it('berechnet volle Stunden', () => {
    expect(schichtStundenGenau({ von: '08:00', bis: '20:00' })).toBe(12);
  });

  it('berechnet Bruchstunden', () => {
    expect(schichtStundenGenau({ von: '09:30', bis: '17:15' })).toBeCloseTo(7.75);
  });
});

describe('positionGesamtCent', () => {
  const schicht = erzeugeTestSchicht({ von: '08:00', bis: '20:00' });

  it('rechnet das Beispiel aus der Anfrage nach: Sanitätshelfer 12€ × 2 × 1h = 24€', () => {
    const position = erzeugeTestPosition({
      art: 'einsatzkraft',
      einzelpreisCent: 1200,
      anzahl: 2,
      stunden: 1,
    });
    expect(positionGesamtCent(position, schicht)).toBe(2400);
  });

  it('rechnet das Beispiel aus der Anfrage nach: Krankentransportwagen 50€ Pauschal × 1 = 50€', () => {
    const position = erzeugeTestPosition({
      art: 'fahrzeug',
      bezeichnung: 'Krankentransportwagen',
      einzelpreisCent: 5000,
      anzahl: 1,
      stunden: null,
    });
    expect(positionGesamtCent(position, schicht)).toBe(5000);
  });

  it('ignoriert Stunden bei Fahrzeugen und multipliziert nur mit der Anzahl', () => {
    const position = erzeugeTestPosition({
      art: 'fahrzeug',
      einzelpreisCent: 3000,
      anzahl: 2,
      stunden: null,
    });
    expect(positionGesamtCent(position, schicht)).toBe(6000);
  });

  it('fällt ohne eigene Stunden-Angabe auf die Schichtdauer zurück', () => {
    const position = erzeugeTestPosition({
      einzelpreisCent: 1000,
      anzahl: 1,
      stunden: null as never,
    });
    expect(positionGesamtCent(position, schicht)).toBe(12_000);
  });

  it('nutzt eine explizite Stunden-Angabe, auch wenn sie von der Schichtdauer abweicht', () => {
    const position = erzeugeTestPosition({ einzelpreisCent: 1000, anzahl: 1, stunden: 4 });
    expect(positionGesamtCent(position, schicht)).toBe(4000);
  });

  it('rundet Bruchstunden auf ganze Cent, nicht die Gesamtsumme', () => {
    const position = erzeugeTestPosition({ einzelpreisCent: 1233, anzahl: 1, stunden: 0.75 });
    // 1233 * 0.75 = 924.75 -> 925
    expect(positionGesamtCent(position, schicht)).toBe(925);
  });
});

describe('schichtGesamtCent', () => {
  it('summiert gemischte Positionsarten einer Schicht', () => {
    const schicht = erzeugeTestSchicht({
      von: '08:00',
      bis: '20:00',
      positionen: [
        erzeugeTestPosition({ art: 'einsatzkraft', einzelpreisCent: 1200, anzahl: 2, stunden: 1 }),
        erzeugeTestPosition({ art: 'fahrzeug', einzelpreisCent: 5000, anzahl: 1, stunden: null }),
      ],
    });
    expect(schichtGesamtCent(schicht)).toBe(2400 + 5000);
  });

  it('liefert 0 für eine Schicht ohne Positionen', () => {
    expect(schichtGesamtCent(erzeugeTestSchicht({ positionen: [] }))).toBe(0);
  });
});

describe('angebotRechnerischGesamtCent', () => {
  it('summiert mehrere Schichten an unterschiedlichen Tagen', () => {
    const angebot = erzeugeTestAngebot({
      schichten: [
        erzeugeTestSchicht({
          datum: '2026-09-12',
          von: '08:00',
          bis: '20:00',
          positionen: [erzeugeTestPosition({ einzelpreisCent: 1200, anzahl: 1, stunden: 1 })],
        }),
        erzeugeTestSchicht({
          datum: '2026-09-13',
          von: '08:00',
          bis: '14:00',
          positionen: [erzeugeTestPosition({ einzelpreisCent: 1200, anzahl: 1, stunden: 1 })],
        }),
      ],
    });
    expect(angebotRechnerischGesamtCent(angebot)).toBe(1200 + 1200);
  });
});

describe('angebotGesamtCent', () => {
  const angebot = erzeugeTestAngebot({
    schichten: [
      erzeugeTestSchicht({
        von: '08:00',
        bis: '20:00',
        positionen: [erzeugeTestPosition({ einzelpreisCent: 1200, anzahl: 2, stunden: 1 })],
      }),
    ],
  });

  it('entspricht der rechnerischen Summe, wenn kein Pauschalpreis aktiv ist', () => {
    expect(
      angebotGesamtCent({ ...angebot, pauschalpreisAktiv: false, pauschalpreisCent: null }),
    ).toBe(angebotRechnerischGesamtCent(angebot));
  });

  it('ersetzt die Summe durch den Pauschalpreis, wenn er aktiv ist', () => {
    expect(
      angebotGesamtCent({ ...angebot, pauschalpreisAktiv: true, pauschalpreisCent: 99_900 }),
    ).toBe(99_900);
  });

  it('respektiert pauschalpreisCent = 0 als gültigen Override', () => {
    expect(angebotGesamtCent({ ...angebot, pauschalpreisAktiv: true, pauschalpreisCent: 0 })).toBe(
      0,
    );
  });
});

describe('berechneAngebot', () => {
  it('nummeriert Positionen fortlaufend über mehrere Schichten hinweg', () => {
    const angebot = erzeugeTestAngebot({
      schichten: [
        erzeugeTestSchicht({
          positionen: [erzeugeTestPosition(), erzeugeTestPosition()],
        }),
        erzeugeTestSchicht({ positionen: [erzeugeTestPosition()] }),
      ],
    });
    const kalkulation = berechneAngebot(angebot);
    expect(kalkulation.gruppen[0].positionen.map((p) => p.pos)).toEqual([1, 2]);
    expect(kalkulation.gruppen[1].positionen.map((p) => p.pos)).toEqual([3]);
  });

  it('liefert dieselbe Gesamtsumme wie angebotGesamtCent', () => {
    const angebot = erzeugeTestAngebot({ pauschalpreisAktiv: true, pauschalpreisCent: 12_300 });
    const kalkulation = berechneAngebot(angebot);
    expect(kalkulation.gesamtCent).toBe(12_300);
    expect(kalkulation.rechnerischGesamtCent).toBe(angebotRechnerischGesamtCent(angebot));
  });
});
