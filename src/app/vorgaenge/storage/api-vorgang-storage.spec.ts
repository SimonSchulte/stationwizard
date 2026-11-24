import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../kern/worker-client';
import { testDarstellung, testMeldung } from '../testing/vorgang-testdaten';
import { ApiVorgangStorage } from './api-vorgang-storage';

function antwort(daten: unknown, etag: string | null = '"3"'): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (etag) headers['ETag'] = etag;
  return new Response(JSON.stringify(daten), { headers });
}

describe('ApiVorgangStorage', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };
  let storage: ApiVorgangStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiVorgangStorage);
  });

  it('legt mit If-None-Match: * an und liefert Stand samt ETag', async () => {
    worker.anfragen.mockResolvedValue(antwort(testDarstellung()));
    const stand = await storage.lege('f-1', 'Titel', testMeldung());
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/vorgaenge');
    expect(optionen.method).toBe('POST');
    expect(optionen.headers['If-None-Match']).toBe('*');
    expect(JSON.parse(optionen.body).fahrzeugId).toBe('f-1');
    expect(stand.version).toBe('"3"');
  });

  it('speichert die Meldung mit der Version der Meldung', async () => {
    worker.anfragen.mockResolvedValue(antwort(testDarstellung()));
    await storage.speichereMeldung('v-1', testMeldung(), 4);
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/vorgaenge/v-1/meldung');
    expect(optionen.method).toBe('PUT');
    expect(optionen.headers['If-Match']).toBe('"4"');
  });

  it('sendet nur die Aktion beim Unterschreiben, nie ein Bild', async () => {
    worker.anfragen.mockResolvedValue(antwort(testDarstellung()));
    await storage.unterschreibe('v-1', 'fest');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/vorgaenge/v-1/meldung/unterschriften/fest');
    expect(JSON.parse(optionen.body)).toEqual({ aktion: 'unterschreiben' });
  });

  it('wechselt die Stufe mit der Version des Vorgangs', async () => {
    worker.anfragen.mockResolvedValue(antwort(testDarstellung()));
    await storage.wechsleStufe('v-1', 1, '"7"');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/vorgaenge/v-1/stufe');
    expect(optionen.headers['If-Match']).toBe('"7"');
    expect(JSON.parse(optionen.body)).toEqual({ nach: 1 });
  });

  it('sendet die Meldung mit PDF, Empfängern und der Version des Vorgangs', async () => {
    worker.anfragen.mockResolvedValue(antwort(testDarstellung()));
    await storage.sende('v-1', '"5"', {
      modus: 'einreichen',
      pdf: 'JVBERg==',
      empfaenger: ['a@example.test'],
      angebote: ['x'],
      nachricht: '',
    });
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/vorgaenge/v-1/einreichen');
    expect(optionen.method).toBe('POST');
    expect(optionen.headers['If-Match']).toBe('"5"');
    expect(JSON.parse(optionen.body)).toMatchObject({ modus: 'einreichen', angebote: ['x'] });
  });

  it('weist Antworten ohne ETag oder mit falscher Form ab', async () => {
    worker.anfragen.mockResolvedValueOnce(antwort(testDarstellung(), null));
    await expect(storage.lade('v-1')).rejects.toThrow();
    worker.anfragen.mockResolvedValueOnce(antwort({ vorgang: 1 }));
    await expect(storage.lade('v-1')).rejects.toThrow();
  });

  it('filtert ungültige Listeneinträge heraus', async () => {
    worker.json.mockResolvedValue({ vorgaenge: [{ unvollstaendig: true }] });
    expect(await storage.liste()).toEqual([]);
  });
});
