import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { testFeedEintrag, testVeranstaltung } from '../testing/veranstaltung-testdaten';
import { PlanungOeffnenDienst } from './planung-oeffnen';
import { PlanungStoreService } from './planung-store.service';

describe('PlanungOeffnenDienst.planungAusVeranstaltungBauen', () => {
  let dienst: PlanungOeffnenDienst;

  beforeEach(() => {
    dienst = TestBed.inject(PlanungOeffnenDienst);
  });

  it('baut je Schicht einen Posten nach Zeitraum, ohne Einsatzkräfte, und öffnet nichts', () => {
    const veranstaltung = testVeranstaltung({
      schichten: [
        testFeedEintrag({ beginnZeit: '09:00', endeZeit: '12:00' }),
        testFeedEintrag({ schluessel: 'b', beginnZeit: '12:00', endeZeit: '' }),
        testFeedEintrag({ schluessel: 'c', beginnZeit: '', endeZeit: '' }),
      ],
    });

    const planung = dienst.planungAusVeranstaltungBauen(veranstaltung);

    expect(planung.name).toBe('Weihnachtsmarkt Ummeln');
    expect(planung.hiorg_einsatz_id).toBe('dienst-4711');
    expect(planung.start).toBe('2026-12-05T10:00');
    expect(planung.end).toBe('2026-12-05T20:30');
    expect(planung.posten.map((p) => p.label)).toEqual(['09:00–12:00', 'ab 12:00', 'ganztägig']);
    expect(planung.posten.every((p) => p.fahrzeug === null && p.positions.length === 0)).toBe(true);
    expect(planung.einsatzkraefte).toEqual([]);
    expect(TestBed.inject(PlanungStoreService).active()).toBeNull();
  });
});
