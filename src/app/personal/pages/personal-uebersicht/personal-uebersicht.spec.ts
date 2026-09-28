import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { WorkerClient } from '../../../kern/worker-client';
import { PersonalUebersicht } from './personal-uebersicht';

function aufbauen(antworten: Record<string, unknown>, abfrage: Record<string, string> = {}) {
  const assign = vi.fn();
  const json = vi.fn(async (pfad: string) => antworten[pfad]);
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkerClient, useValue: { json } },
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(abfrage) } },
      },
      { provide: DialogDienst, useValue: { bestaetigen: vi.fn().mockResolvedValue(true) } },
      { provide: DOCUMENT, useValue: { location: { assign } } },
    ],
  });
  const seite = TestBed.runInInjectionContext(() => new PersonalUebersicht());
  return { seite, json, assign };
}

describe('PersonalUebersicht', () => {
  it('ruft ohne Verbindung kein Personal ab und startet die Anmeldung mit Rückkehr hierher', async () => {
    const { seite, json, assign } = aufbauen({
      '/api/hiorg/verbindung': { eingerichtet: true, verbunden: false },
    });
    await seite.laden();
    expect(seite.verbindung()).toBe('getrennt');
    expect(json).not.toHaveBeenCalledWith('/api/hiorg/personal');
    await seite.verbinden();
    expect(assign).toHaveBeenCalledWith('/hiorg/verbinden?ziel=personal');
  });

  it('filtert nach Name, Gruppe und Qualifikation', async () => {
    const { seite } = aufbauen({
      '/api/hiorg/verbindung': { eingerichtet: true, verbunden: true },
      '/api/hiorg/personal': {
        personen: [
          {
            id: 'a',
            vorname: 'Erika',
            nachname: 'Beispiel',
            gruppen: ['Bereitschaft'],
            qualifikationen: [{ liste: 'med', name: 'Rettungssanitäter/in', kurz: 'RS' }],
          },
          {
            id: 'b',
            vorname: 'Max',
            nachname: 'Muster',
            gruppen: ['Betreuung'],
            qualifikationen: [],
          },
        ],
      },
    });
    await seite.laden();
    expect(seite.personen().length).toBe(2);
    seite.suche.set('rs');
    expect(seite.gefiltert().map((p) => p.id)).toEqual(['a']);
    seite.suche.set('betreu');
    expect(seite.gefiltert().map((p) => p.id)).toEqual(['b']);
    expect(seite.qualifikationen(seite.personen()[0])).toEqual(['med: Rettungssanitäter/in (RS)']);
  });
});
