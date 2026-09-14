import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { Benutzerkonto } from '../models/benutzerkonto.model';
import { ApiBenutzerverwaltungStorage } from './api-benutzerverwaltung-storage';
import { BenutzerNichtGefundenFehler } from './benutzerverwaltung-storage';

function testkonto(ueberschreibung: Partial<Benutzerkonto> = {}): Benutzerkonto {
  return {
    email: 'person@example.test',
    rolle: null,
    sonderrollen: [],
    ersterZugriffAm: '2026-01-01T00:00:00.000Z',
    letzterZugriffAm: '2026-01-02T00:00:00.000Z',
    rolleGeaendertAm: null,
    rolleGeaendertVon: null,
    ...ueberschreibung,
  };
}

describe('ApiBenutzerverwaltungStorage', () => {
  const worker = { json: vi.fn() };
  let storage: ApiBenutzerverwaltungStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiBenutzerverwaltungStorage);
  });

  it('lädt und prüft die Benutzerliste, bevor sie an die Fachschicht geht', async () => {
    const konto = testkonto();
    worker.json.mockResolvedValue({ benutzer: [konto, { unvollstaendig: true }] });
    const ergebnis = await storage.ladeBenutzer();
    expect(ergebnis).toEqual([konto]);
  });

  it('setzt die Rolle über PUT mit codierter E-Mail-Adresse', async () => {
    const konto = testkonto({ rolle: 'helfer' });
    worker.json.mockResolvedValue(konto);
    const ergebnis = await storage.rolleSetzen('person@example.test', 'helfer', []);
    expect(ergebnis).toEqual(konto);
    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe('/api/benutzerverwaltung/person%40example.test');
    expect(optionen.method).toBe('PUT');
    expect(JSON.parse(optionen.body)).toEqual({ rolle: 'helfer', sonderrollen: [] });
  });

  it('übersetzt einen 404er in BenutzerNichtGefundenFehler', async () => {
    worker.json.mockRejectedValue(new WorkerFehler('nicht gefunden', 404));
    await expect(
      storage.rolleSetzen('unbekannt@example.test', 'helfer', []),
    ).rejects.toBeInstanceOf(BenutzerNichtGefundenFehler);
  });
});
