import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../kern/worker-client';
import { EhrungenService, vorgangSchluessel } from './ehrungen.service';

function aufbauen(json: (pfad: string, optionen?: RequestInit) => Promise<unknown>) {
  TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: { json } }] });
  return TestBed.runInInjectionContext(() => new EhrungenService());
}

const VORGANG = {
  personId: 'p1',
  auszeichnung: 'silber',
  abgestimmtOb: true,
  beantragt: false,
  begruendung: '',
  antragErstelltAm: null,
  geaendertAm: 'x',
  geaendertVon: 'y',
};

describe('EhrungenService: Bearbeitungsstand', () => {
  it('lädt alle Haken in einem Aufruf', async () => {
    const json = vi.fn(async () => ({ vorgaenge: [VORGANG] }));
    const dienst = aufbauen(json);
    await dienst.vorgaengeLaden();
    expect(json).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledWith('/api/personal/ehrungen/vorgaenge');
    expect(dienst.vorgaenge().get(vorgangSchluessel('p1', 'silber'))?.abgestimmtOb).toBe(true);
  });

  it('weist ungültige Antworten ab', async () => {
    const dienst = aufbauen(async () => ({ vorgaenge: [{ ...VORGANG, auszeichnung: 'platin' }] }));
    await expect(dienst.vorgaengeLaden()).rejects.toThrow();
    expect(dienst.vorgaenge().size).toBe(0);
  });

  it('sendet nur das geänderte Feld und übernimmt die Antwort', async () => {
    const json = vi.fn(async (_pfad: string, _optionen?: RequestInit) => ({
      ...VORGANG,
      beantragt: true,
    }));
    const dienst = aufbauen(json);
    await dienst.vorgangSetzen('p1', 'silber', 'beantragt', true);
    const [pfad, optionen] = json.mock.calls[0];
    expect(pfad).toBe('/api/personal/ehrungen/p1/vorgaenge/silber');
    expect(optionen?.method).toBe('PUT');
    expect(JSON.parse(optionen?.body as string)).toEqual({ beantragt: true });
    expect(dienst.vorgaenge().get(vorgangSchluessel('p1', 'silber'))?.beantragt).toBe(true);
  });

  it('behält den alten Stand, wenn das Speichern fehlschlägt', async () => {
    const dienst = aufbauen(async () => {
      throw new Error('Netz weg');
    });
    await expect(dienst.vorgangSetzen('p1', 'silber', 'beantragt', true)).rejects.toThrow();
    expect(dienst.vorgaenge().size).toBe(0);
  });
});
