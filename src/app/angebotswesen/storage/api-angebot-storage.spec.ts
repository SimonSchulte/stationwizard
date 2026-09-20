import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { erzeugeTestAngebot } from '../testing/angebot-testdaten';
import { ApiAngebotStorage } from './api-angebot-storage';
import { AngebotKonfliktFehler } from './angebot-storage';

describe('ApiAngebotStorage', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };
  let storage: ApiAngebotStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiAngebotStorage);
  });

  it('lädt und prüft die Angebotsliste, bevor sie an die Fachschicht geht', async () => {
    const angebot = erzeugeTestAngebot();
    worker.json.mockResolvedValue({ angebote: [angebot, { unvollstaendig: true }] });
    const ergebnis = await storage.ladeAngebote();
    expect(ergebnis).toEqual([angebot]);
  });

  it('ruft dieselbe Liste nicht bei jedem Seitenwechsel erneut ab', async () => {
    worker.json.mockResolvedValue({ angebote: [erzeugeTestAngebot()] });
    await storage.ladeAngebote();
    await storage.ladeAngebote();
    expect(worker.json).toHaveBeenCalledOnce();
  });

  it('puffert das Angebot samt Version nicht – ein alter ETag führte zu 412', async () => {
    const angebot = erzeugeTestAngebot();
    worker.anfragen.mockResolvedValue(
      new Response(JSON.stringify(angebot), {
        headers: { 'Content-Type': 'application/json', ETag: '"1"' },
      }),
    );
    await storage.ladeAngebot(angebot.id);
    worker.anfragen.mockResolvedValue(
      new Response(JSON.stringify(angebot), {
        headers: { 'Content-Type': 'application/json', ETag: '"2"' },
      }),
    );
    expect((await storage.ladeAngebot(angebot.id))?.version).toBe('"2"');
  });

  it('legt ein neues Angebot mit If-None-Match: * an', async () => {
    const angebot = erzeugeTestAngebot();
    worker.anfragen.mockResolvedValue(
      new Response(null, { status: 201, headers: { ETag: '"1"' } }),
    );
    const version = await storage.speichereAngebot(angebot, null);
    expect(version).toBe('"1"');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/angebotswesen/angebote');
    expect(optionen.method).toBe('POST');
    expect(optionen.headers.get('If-None-Match')).toBe('*');
  });

  it('aktualisiert ein Angebot mit der zuletzt gelesenen Version über If-Match', async () => {
    const angebot = erzeugeTestAngebot();
    worker.anfragen.mockResolvedValue(
      new Response(null, { status: 200, headers: { ETag: '"2"' } }),
    );
    const version = await storage.speichereAngebot(angebot, '"1"');
    expect(version).toBe('"2"');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe(`/api/angebotswesen/angebote/${angebot.id}`);
    expect(optionen.method).toBe('PUT');
    expect(optionen.headers.get('If-Match')).toBe('"1"');
  });

  it('übersetzt einen 412er in AngebotKonfliktFehler', async () => {
    worker.anfragen.mockRejectedValue(new WorkerFehler('Konflikt', 412));
    await expect(storage.speichereAngebot(erzeugeTestAngebot(), '"1"')).rejects.toBeInstanceOf(
      AngebotKonfliktFehler,
    );
  });

  it('liefert null für ein nicht gefundenes Angebot, statt zu werfen', async () => {
    worker.anfragen.mockRejectedValue(new WorkerFehler('Nicht gefunden', 404));
    expect(await storage.ladeAngebot('unbekannt')).toBeNull();
  });

  it('löscht ein Angebot und verwirft die gepufferte Liste', async () => {
    worker.anfragen.mockResolvedValue(new Response(null, { status: 204 }));
    await storage.loescheAngebot('x');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/angebotswesen/angebote/x');
    expect(optionen.method).toBe('DELETE');
  });
});
