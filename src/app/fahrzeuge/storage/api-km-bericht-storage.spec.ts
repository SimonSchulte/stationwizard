import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { KmBericht } from '../models/km-bericht.model';
import { ApiKmBerichtStorage } from './api-km-bericht-storage';
import { VersandNichtMoeglichFehler } from './km-bericht-storage';

const BERICHT: KmBericht = {
  stichtag: '2026-06-15',
  jahr: 2026,
  zeilen: [],
  ohneAblesung: 0,
  unterSoll: 0,
};

describe('ApiKmBerichtStorage', () => {
  const worker = { json: vi.fn() };
  let storage: ApiKmBerichtStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiKmBerichtStorage);
  });

  it('lädt die Vorschau ohne Schreibzugriff', async () => {
    worker.json.mockResolvedValue(BERICHT);
    expect(await storage.ladeBericht()).toEqual(BERICHT);
    expect(worker.json.mock.calls[0][0]).toBe('/api/fahrzeuge/km-bericht');
    expect(worker.json.mock.calls[0][1]).toBeUndefined();
  });

  it('lehnt einen ungültigen Bericht ab, statt ihn weiterzureichen', async () => {
    worker.json.mockResolvedValue({ stichtag: '15.06.2026' });
    await expect(storage.ladeBericht()).rejects.toBeInstanceOf(WorkerFehler);
  });

  it('sendet über POST auf den Sendepfad', async () => {
    worker.json.mockResolvedValue({
      gesendetAn: 'leitung@example.test',
      gesendetAm: '2026-06-15T10:00:00.000Z',
      gesendetVon: 'person@example.test',
      anzahlFahrzeuge: 0,
      versandweg: 'email-routing',
    });
    await storage.sendeBericht();
    expect(worker.json.mock.calls[0][0]).toBe('/api/fahrzeuge/km-bericht/senden');
    expect(worker.json.mock.calls[0][1].method).toBe('POST');
  });

  it.each([
    [409, 'Es ist keine Empfängeradresse hinterlegt.'],
    [503, 'Der gewählte Versandweg ist am Worker nicht eingerichtet.'],
  ])(
    'übersetzt HTTP %i in eine offene Einstellung, nicht in eine Störung',
    async (status, text) => {
      worker.json.mockRejectedValue(new WorkerFehler('Serverantwort', status));
      await expect(storage.sendeBericht()).rejects.toMatchObject({
        name: 'VersandNichtMoeglichFehler',
        message: text,
      });
    },
  );

  it('reicht andere Fehler unverändert weiter', async () => {
    worker.json.mockRejectedValue(new WorkerFehler('Serverfehler', 502));
    await expect(storage.sendeBericht()).rejects.not.toBeInstanceOf(VersandNichtMoeglichFehler);
  });
});
