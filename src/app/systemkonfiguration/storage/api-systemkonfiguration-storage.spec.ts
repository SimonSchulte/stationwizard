import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { ApiSystemkonfigurationStorage } from './api-systemkonfiguration-storage';

const ANTWORT = {
  einstellungen: {
    kmBerichtEmpfaenger: 'leitung@example.test',
    kmBerichtVersandweg: 'email-routing',
    kmBerichtBetreff: 'Kilometerstandsbericht',
    materialBestellscheinEmpfaenger: '',
    materialMaengelLandEmpfaenger: '',
    materialMaengelSegEmpfaenger: '',
    materialVersandweg: 'email-routing',
    materialBetreff: 'Materialmeldung',
  },
  versandwege: [
    { weg: 'email-routing', verfuegbar: true },
    { weg: 'resend', verfuegbar: false },
  ],
};

describe('ApiSystemkonfigurationStorage', () => {
  const worker = { json: vi.fn() };
  let storage: ApiSystemkonfigurationStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiSystemkonfigurationStorage);
  });

  it('lädt die Konfiguration', async () => {
    worker.json.mockResolvedValue(ANTWORT);
    expect(await storage.laden()).toEqual(ANTWORT);
    expect(worker.json.mock.calls[0][0]).toBe('/api/systemkonfiguration');
  });

  it('speichert den vollständigen Satz Einstellungen per PUT', async () => {
    worker.json.mockResolvedValue(ANTWORT);
    await storage.speichern(ANTWORT.einstellungen as never);

    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe('/api/systemkonfiguration');
    expect(optionen.method).toBe('PUT');
    expect(JSON.parse(optionen.body)).toEqual(ANTWORT.einstellungen);
  });

  it('lehnt eine ungültige Serverantwort ab, statt sie weiterzureichen', async () => {
    worker.json.mockResolvedValue({ einstellungen: { kmBerichtVersandweg: 'smtp' } });
    await expect(storage.laden()).rejects.toBeInstanceOf(WorkerFehler);
  });
});
