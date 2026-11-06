import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { MeldungsDienst, type MeldungOptionen } from '../../kern/zustand/zustand';
import { PlanStore } from './plan-store';
import { TerminLoeschenDienst } from './termin-loeschen';
import { leererTermin } from '../models/plan.model';

function aufbau() {
  const info = vi.fn((_text: string, _optionen?: MeldungOptionen) => ({ schliessen: vi.fn() }));
  const hinweis = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MeldungsDienst, useValue: { info } },
      { provide: DialogDienst, useValue: { hinweis } },
    ],
  });
  const store = TestBed.inject(PlanStore);
  const dienst = TestBed.inject(TerminLoeschenDienst);
  const id = store.fuegeTerminEin({ ...leererTermin('2026-05-05'), thema: 'Funk' });
  return { store, dienst, id, info, hinweis };
}

describe('TerminLoeschenDienst', () => {
  it('löscht, meldet und nimmt das Löschen über die Aktion zurück', () => {
    const { store, dienst, id, info } = aufbau();
    dienst.loesche(id);
    expect(store.terminNachId(id)).toBeUndefined();
    expect(info.mock.calls[0]?.[0]).toContain('Funk');
    info.mock.calls[0]?.[1]?.beiAktion?.();
    expect(store.terminNachId(id)?.thema).toBe('Funk');
  });

  it('nimmt nichts zurück, wenn der Kalender seither weiter geändert wurde', () => {
    const { store, dienst, id, info, hinweis } = aufbau();
    dienst.loesche(id);
    store.fuegeTerminEin({ ...leererTermin('2026-05-06'), thema: 'Neu' });
    info.mock.calls[0]?.[1]?.beiAktion?.();
    expect(store.terminNachId(id)).toBeUndefined();
    expect(hinweis).toHaveBeenCalled();
  });
});
