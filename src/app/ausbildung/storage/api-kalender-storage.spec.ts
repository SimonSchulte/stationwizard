import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { leererTermin } from '../models/plan.model';
import { ApiKalenderStorage } from './api-kalender-storage';
import { KalenderBereitsBefuelltFehler, KalenderKonfliktFehler } from './kalender-storage';

function jsonAntwort(inhalt: unknown, header: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(inhalt), {
    headers: { 'Content-Type': 'application/json', ...header },
  });
}

const TERMIN = { ...leererTermin('2026-03-02'), id: 't1', thema: 'Erfundenes Thema' };
const IDEE = { ...leererTermin(null), id: 'i1', thema: 'Erfundene Idee' };
const JAHR = { jahr: 2026, titel: 'Jahresplan 2026', termine: [TERMIN], katsThemen: [] };

describe('ApiKalenderStorage', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };
  let storage: ApiKalenderStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiKalenderStorage);
  });

  it('lädt alle Jahre und Ideen in einem Aufruf und leitet die Versionen ab', async () => {
    worker.anfragen.mockResolvedValue(
      jsonAntwort({
        jahre: [{ ...JAHR, version: 3, geaendertAm: 'x', geaendertVon: 'y' }],
        ideen: { termine: [IDEE], version: 2 },
      }),
    );
    const stand = await storage.laden();
    expect(worker.anfragen).toHaveBeenCalledOnce();
    expect(stand.jahre[0]!.version).toBe('"3"');
    expect(stand.jahre[0]!.blatt).toEqual(JAHR);
    expect(stand.ideen).toEqual({ termine: [IDEE], version: '"2"' });
  });

  it('lehnt eine Antwort mit ungültigem Termin ab, statt sie ins Modell zu lassen', async () => {
    worker.anfragen.mockResolvedValue(
      jsonAntwort({
        jahre: [{ ...JAHR, termine: [{ ...TERMIN, kategorie: 'Erfunden' }], version: 1 }],
        ideen: null,
      }),
    );
    await expect(storage.laden()).rejects.toBeInstanceOf(WorkerFehler);
  });

  it('legt ein neues Jahr mit If-None-Match: * an', async () => {
    worker.anfragen.mockResolvedValue(new Response(null, { headers: { ETag: '"1"' } }));
    expect(await storage.speichereJahr(JAHR, null)).toBe('"1"');
    const [pfad, optionen] = worker.anfragen.mock.calls[0]!;
    expect(pfad).toBe('/api/kalender/jahre');
    expect(optionen.method).toBe('POST');
    expect(new Headers(optionen.headers).get('If-None-Match')).toBe('*');
    expect(new Headers(optionen.headers).has('If-Match')).toBe(false);
  });

  it('aktualisiert ein Jahr ausschließlich mit If-Match', async () => {
    worker.anfragen.mockResolvedValue(new Response(null, { headers: { ETag: '"4"' } }));
    expect(await storage.speichereJahr(JAHR, '"3"')).toBe('"4"');
    const [pfad, optionen] = worker.anfragen.mock.calls[0]!;
    expect(pfad).toBe('/api/kalender/jahre/2026');
    expect(optionen.method).toBe('PUT');
    expect(new Headers(optionen.headers).get('If-Match')).toBe('"3"');
    expect(new Headers(optionen.headers).has('If-None-Match')).toBe(false);
  });

  it('übersetzt 412 in einen Konfliktfehler', async () => {
    worker.anfragen.mockRejectedValue(new WorkerFehler('geändert', 412));
    await expect(storage.speichereIdeen([IDEE], '"2"')).rejects.toBeInstanceOf(
      KalenderKonfliktFehler,
    );
  });

  it('übersetzt 409 bei der Migration in „bereits befüllt“', async () => {
    worker.anfragen.mockRejectedValue(new WorkerFehler('befüllt', 409));
    await expect(storage.migriere({ jahre: [JAHR], backlog: [] })).rejects.toBeInstanceOf(
      KalenderBereitsBefuelltFehler,
    );
  });

  it('überträgt die Arbeitsmappe bei der Migration in einer Anfrage mit If-None-Match: *', async () => {
    worker.anfragen.mockResolvedValue(
      jsonAntwort({
        jahre: [{ ...JAHR, version: 1 }],
        ideen: { termine: [IDEE], version: 1 },
      }),
    );
    const stand = await storage.migriere({ jahre: [JAHR], backlog: [IDEE] });
    const [pfad, optionen] = worker.anfragen.mock.calls[0]!;
    expect(pfad).toBe('/api/kalender/migration');
    expect(new Headers(optionen.headers).get('If-None-Match')).toBe('*');
    expect(JSON.parse(optionen.body)).toEqual({ jahre: [JAHR], ideen: [IDEE] });
    expect(stand.jahre).toHaveLength(1);
  });
});
