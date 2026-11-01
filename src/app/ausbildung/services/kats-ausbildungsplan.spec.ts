import { describe, expect, it } from 'vitest';
import { KatsThema, Termin, leererTermin } from '../models/plan.model';
import { baueKatsAusbildungsplan, istKatsAusbildung } from './kats-ausbildungsplan';

function termin(datum: string | null, aenderung: Partial<Termin> = {}): Termin {
  return { ...leererTermin(datum), thema: 'Thema', ...aenderung };
}

const THEMEN: KatsThema[] = [
  { id: 'a', nummer: '2.10', titel: 'Funk', beschreibung: '', pflicht: true },
  { id: 'b', nummer: '2.2', titel: 'Brand', beschreibung: '', pflicht: true },
  { id: 'c', nummer: '1.1', titel: 'Recht', beschreibung: '', pflicht: false },
];

describe('KatS-Ausbildungsplan', () => {
  it('erkennt KatS-Ausbildungen an Thema, Pflicht oder KatS-Titel, nie ohne Datum', () => {
    expect(istKatsAusbildung(termin('2026-03-02', { katsThemaId: 'a' }))).toBe(true);
    expect(istKatsAusbildung(termin('2026-03-02', { katsPflicht: true }))).toBe(true);
    expect(istKatsAusbildung(termin('2026-03-02', { katsTitel: ' Frei ' }))).toBe(true);
    expect(istKatsAusbildung(termin('2026-03-02'))).toBe(false);
    expect(istKatsAusbildung(termin(null, { katsThemaId: 'a' }))).toBe(false);
  });

  it('gruppiert nach Monat, sortiert chronologisch und lässt leere Monate weg', () => {
    const plan = baueKatsAusbildungsplan(
      [
        termin('2026-05-04', { katsThemaId: 'a' }),
        termin('2026-03-16', { katsThemaId: 'b' }),
        termin('2026-03-02', { katsTitel: 'Frei' }),
        termin('2026-04-06'),
      ],
      THEMEN,
    );
    expect(plan.monate.map((m) => m.index)).toEqual([2, 4]);
    expect(plan.monate[0]!.ausbildungen.map((e) => e.termin.datum)).toEqual([
      '2026-03-02',
      '2026-03-16',
    ]);
    expect(plan.monate[0]!.ausbildungen[1]!.thema?.titel).toBe('Brand');
    expect(plan.kennzahlen.ausbildungen).toBe(3);
  });

  it('listet Themen ohne Termin, Pflicht zuerst und nach Nummer, und zählt offene Pflichtthemen', () => {
    const plan = baueKatsAusbildungsplan([termin('2026-05-04', { katsThemaId: 'b' })], THEMEN);
    expect(plan.ohneTermin.map((t) => t.id)).toEqual(['a', 'c']);
    expect(plan.kennzahlen.pflichtOffen).toBe(1);
    expect(plan.kennzahlen.themenGesamt).toBe(3);
  });

  it('zeigt bei leerem Plan alle Themen als ohne Termin', () => {
    const plan = baueKatsAusbildungsplan([], THEMEN);
    expect(plan.ohneTermin).toHaveLength(3);
    expect(plan.monate).toEqual([]);
  });
});
