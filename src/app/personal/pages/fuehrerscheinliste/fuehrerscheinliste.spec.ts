import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../../kern/worker-client';
import { Fuehrerscheinliste } from './fuehrerscheinliste';

function aufbauen(antworten: Record<string, unknown>) {
  const json = vi.fn(async (pfad: string) => antworten[pfad]);
  TestBed.configureTestingModule({
    providers: [{ provide: WorkerClient, useValue: { json } }],
  });
  const seite = TestBed.runInInjectionContext(() => new Fuehrerscheinliste());
  return { seite, json };
}

describe('Fuehrerscheinliste', () => {
  it('ruft ohne Verbindung kein Personal ab', async () => {
    const { seite, json } = aufbauen({
      '/api/hiorg/verbindung': { eingerichtet: true, verbunden: false, modus: 'manuell' },
    });
    await seite.laden();
    expect(seite.verbindung()).toBe('getrennt');
    expect(json).not.toHaveBeenCalledWith('/api/hiorg/personal');
  });

  it('filtert nach Name und Führerscheinklasse und zeigt das Datum deutsch', async () => {
    const { seite } = aufbauen({
      '/api/hiorg/verbindung': { eingerichtet: true, verbunden: true, modus: 'manuell' },
      '/api/hiorg/personal': {
        personen: [
          {
            id: 'a',
            vorname: 'Erika',
            nachname: 'Beispiel',
            gruppen: [],
            qualifikationen: [],
            fahrerlaubnis: {
              klassen: ['B', 'BE'],
              beschraenkung: null,
              fuehrerscheinnummer: '7B9205K0C65',
              fuehrerscheindatum: '1995-11-01',
            },
          },
          {
            id: 'b',
            vorname: 'Max',
            nachname: 'Muster',
            gruppen: [],
            qualifikationen: [],
            fahrerlaubnis: null,
          },
        ],
      },
    });
    await seite.laden();
    expect(seite.personen().length).toBe(2);
    seite.suche.set('be');
    expect(seite.gefiltert().map((p) => p.id)).toEqual(['a']);
    seite.suche.set('muster');
    expect(seite.gefiltert().map((p) => p.id)).toEqual(['b']);
    expect(seite.fuehrerscheindatum(seite.personen()[0])).toBe('01.11.1995');
    expect(seite.fuehrerscheindatum(seite.personen()[1])).toBe('');
  });
});
