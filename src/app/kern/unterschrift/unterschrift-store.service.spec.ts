import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../worker-client';
import { UnterschriftStoreService } from './unterschrift-store.service';

const SCHRIFT = { art: 'schrift', text: 'Max', font: 'Caveat' };

describe('UnterschriftStoreService', () => {
  const worker = { json: vi.fn() };
  let store: UnterschriftStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    store = TestBed.inject(UnterschriftStoreService);
  });

  it('lädt einmal und merkt sich auch „keine Unterschrift“', async () => {
    worker.json.mockResolvedValue({ unterschrift: null });
    expect(await store.laden()).toBeNull();
    expect(await store.laden()).toBeNull();
    expect(worker.json).toHaveBeenCalledTimes(1);
    await store.laden(true);
    expect(worker.json).toHaveBeenCalledTimes(2);
  });

  it('verwirft eine ungültige Serverantwort statt sie zu übernehmen', async () => {
    worker.json.mockResolvedValue({ unterschrift: { art: 'bild' } });
    expect(await store.laden()).toBeNull();
    expect(store.unterschrift()).toBeNull();
  });

  it('speichert per PUT und übernimmt die geprüfte Antwort', async () => {
    worker.json.mockResolvedValue({ unterschrift: SCHRIFT });
    expect(await store.speichern(SCHRIFT as never)).toBe(true);
    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe('/api/benutzer/unterschrift');
    expect(optionen.method).toBe('PUT');
    expect(JSON.parse(optionen.body)).toEqual(SCHRIFT);
    expect(store.unterschrift()).toEqual(SCHRIFT);
  });

  it('meldet einen Fehler und behält den alten Stand', async () => {
    worker.json.mockResolvedValueOnce({ unterschrift: SCHRIFT });
    await store.laden();
    worker.json.mockRejectedValueOnce(new WorkerFehler('Server nicht erreichbar.', 0));
    expect(await store.speichern({ art: 'schrift', text: 'Neu', font: 'Caveat' })).toBe(false);
    expect(store.fehler()).toBe('Server nicht erreichbar.');
    expect(store.unterschrift()).toEqual(SCHRIFT);
  });

  it('entfernt per DELETE', async () => {
    worker.json.mockResolvedValue({ unterschrift: null });
    expect(await store.entfernen()).toBe(true);
    expect(worker.json.mock.calls[0][1].method).toBe('DELETE');
    expect(store.unterschrift()).toBeNull();
  });
});
