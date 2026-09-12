import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { erzeugeTestablesung, erzeugeTestfahrzeug } from '../testing/fahrzeug-testdaten';
import { ApiFahrzeugStorage } from './api-fahrzeug-storage';
import { FahrzeugKonfliktFehler } from './fahrzeug-storage';

describe('ApiFahrzeugStorage', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };
  let storage: ApiFahrzeugStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiFahrzeugStorage);
  });

  it('lädt und prüft die Fahrzeugliste, bevor sie an die Fachschicht geht', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    worker.json.mockResolvedValue({ fahrzeuge: [fahrzeug, { unvollstaendig: true }] });
    const ergebnis = await storage.ladeFahrzeuge();
    expect(ergebnis).toEqual([fahrzeug]);
  });

  it('legt ein neues Fahrzeug mit If-None-Match: * an', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    worker.anfragen.mockResolvedValue(
      new Response(null, { status: 201, headers: { ETag: '"1"' } }),
    );
    const version = await storage.speichereFahrzeug(fahrzeug, null);
    expect(version).toBe('"1"');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/fahrzeuge');
    expect(optionen.method).toBe('POST');
    expect(optionen.headers.get('If-None-Match')).toBe('*');
    expect(optionen.headers.get('If-Match')).toBeNull();
    expect(JSON.parse(optionen.body)).toEqual(fahrzeug);
  });

  it('aktualisiert ein Fahrzeug mit der zuletzt gelesenen Version über If-Match', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    worker.anfragen.mockResolvedValue(
      new Response(null, { status: 200, headers: { ETag: '"2"' } }),
    );
    const version = await storage.speichereFahrzeug(fahrzeug, '"1"');
    expect(version).toBe('"2"');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe(`/api/fahrzeuge/${fahrzeug.id}`);
    expect(optionen.method).toBe('PUT');
    expect(optionen.headers.get('If-Match')).toBe('"1"');
  });

  it('übersetzt einen 412er in FahrzeugKonfliktFehler', async () => {
    worker.anfragen.mockRejectedValue(new WorkerFehler('Konflikt', 412));
    await expect(storage.speichereFahrzeug(erzeugeTestfahrzeug(), '"1"')).rejects.toBeInstanceOf(
      FahrzeugKonfliktFehler,
    );
  });

  it('lädt ein einzelnes Fahrzeug zusammen mit seiner ETag-Version', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    worker.anfragen.mockResolvedValue(
      new Response(JSON.stringify(fahrzeug), {
        headers: { ETag: '"3"', 'Content-Type': 'application/json' },
      }),
    );
    expect(await storage.ladeFahrzeug(fahrzeug.id)).toEqual({ daten: fahrzeug, version: '"3"' });
  });

  it('meldet eine verständliche Fehlermeldung statt eines rohen JSON-Parsefehlers, wenn der Server HTML statt JSON liefert', async () => {
    worker.anfragen.mockResolvedValue(
      new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(storage.ladeFahrzeug('x')).rejects.toMatchObject({
      message: 'Der Server hat keine gültige API-Antwort geliefert.',
    });
  });

  it('liefert null für ein nicht gefundenes Fahrzeug, statt zu werfen', async () => {
    worker.anfragen.mockRejectedValue(new WorkerFehler('Nicht gefunden', 404));
    expect(await storage.ladeFahrzeug('unbekannt')).toBeNull();
  });

  it('reicht andere Fehler beim Laden eines Fahrzeugs weiter', async () => {
    worker.anfragen.mockRejectedValue(new WorkerFehler('Serverfehler', 502));
    await expect(storage.ladeFahrzeug('x')).rejects.toBeInstanceOf(WorkerFehler);
  });

  it('filtert Ablesungen clientseitig ab einem Jahr, geprüft gegen den Domänentyp', async () => {
    const alt = erzeugeTestablesung({ abgelesenAm: '2025-01-01' });
    const neu = erzeugeTestablesung({ abgelesenAm: '2026-01-01' });
    worker.json.mockResolvedValue({ ablesungen: [alt, neu] });
    const ergebnis = await storage.ladeAblesungen('f1', 2026);
    expect(ergebnis).toEqual([neu]);
  });

  it('ergänzt eine Ablesung und liefert die geprüfte Serverantwort', async () => {
    const ablesung = erzeugeTestablesung();
    worker.json.mockResolvedValue(ablesung);
    const eingabe = {
      fahrzeugId: ablesung.fahrzeugId,
      abgelesenAm: ablesung.abgelesenAm,
      stand: ablesung.stand,
      quelle: ablesung.quelle,
      korrigiert: null,
      bemerkung: '',
    };
    const ergebnis = await storage.ergaenzeAblesung(eingabe);
    expect(ergebnis).toEqual(ablesung);
    expect(worker.json.mock.calls[0][0]).toBe(`/api/fahrzeuge/${ablesung.fahrzeugId}/ablesungen`);
  });

  it('lehnt eine ungültige Serverantwort auf eine Ablesung ab, statt sie durchzureichen', async () => {
    worker.json.mockResolvedValue({ unvollstaendig: true });
    await expect(
      storage.ergaenzeAblesung({
        fahrzeugId: 'f1',
        abgelesenAm: '2026-01-01',
        stand: 100,
        quelle: 'formular',
        korrigiert: null,
        bemerkung: '',
      }),
    ).rejects.toBeInstanceOf(WorkerFehler);
  });
});
