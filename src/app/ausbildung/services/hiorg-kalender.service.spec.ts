import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { HiorgKalenderService } from './hiorg-kalender.service';

const ANTWORT = {
  status: 'OK',
  eintraege: [
    {
      sortdate: Date.UTC(2026, 4, 4, 16, 0, 0) / 1000,
      enddate: Date.UTC(2026, 4, 4, 20, 0, 0) / 1000,
      verbez: 'Erfundene Ausbildung Verpflegung',
      typ: 'termin',
      id: 1000001,
      url: 'https://www.hiorg-server.de/formulare.php?ri=1000001',
    },
  ],
};

const json = vi.fn<WorkerClient['json']>();
let dienst: HiorgKalenderService;

beforeEach(() => {
  json.mockReset();
  json.mockResolvedValue(ANTWORT);
  TestBed.configureTestingModule({
    providers: [{ provide: WorkerClient, useValue: { json } }],
  });
  dienst = TestBed.inject(HiorgKalenderService);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HiOrg-Kalenderdienst', () => {
  it('lädt die Einträge über den Worker', async () => {
    await dienst.lade();

    expect(json).toHaveBeenCalledWith('/api/hiorg/kalender');
    expect(dienst.zustand()).toBe('geladen');
    expect(dienst.eintraege()).toHaveLength(1);
    expect(dienst.eintraege()[0]?.name).toBe('Erfundene Ausbildung Verpflegung');
  });

  it('lädt nicht erneut, solange kein neuer Stand verlangt wird', async () => {
    await dienst.lade();
    await dienst.lade();

    expect(json).toHaveBeenCalledTimes(1);
  });

  it('lädt auf ausdrückliche Anforderung neu', async () => {
    await dienst.lade();
    await dienst.lade(true);

    expect(json).toHaveBeenCalledTimes(2);
  });

  it('bündelt gleichzeitige Aufrufe zu einem Abruf', async () => {
    await Promise.all([dienst.lade(), dienst.lade()]);

    expect(json).toHaveBeenCalledTimes(1);
  });

  it('behandelt einen noch nicht eingerichteten Feed als Hinweis, nicht als Fehler', async () => {
    json.mockRejectedValue(new WorkerFehler('Noch nicht eingerichtet.', 503));

    await dienst.lade();

    expect(dienst.zustand()).toBe('nicht-konfiguriert');
    expect(dienst.fehler()).toBe('');
    expect(dienst.eintraege()).toEqual([]);
  });

  it('meldet einen Abruffehler, ohne zu werfen', async () => {
    json.mockRejectedValue(new WorkerFehler('Nicht erreichbar. [HIORG_KALENDER_ZEITLIMIT]', 504));

    await expect(dienst.lade()).resolves.toBeUndefined();
    expect(dienst.zustand()).toBe('fehler');
    expect(dienst.fehler()).toContain('HIORG_KALENDER_ZEITLIMIT');
    expect(dienst.eintraege()).toEqual([]);
  });

  it('speichert keine Feed-Inhalte im Browser', async () => {
    const schreiben = vi.spyOn(Storage.prototype, 'setItem');

    await dienst.lade();

    expect(schreiben).not.toHaveBeenCalled();
  });
});
