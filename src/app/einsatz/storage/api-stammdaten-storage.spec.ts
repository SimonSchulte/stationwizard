import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import {
  erzeugeTestArtikel,
  erzeugeTestKiste,
  erzeugeTestLager,
} from '../testing/stammdaten-testdaten';
import { ApiStammdatenStorage } from './api-stammdaten-storage';
import {
  StammdatenInNutzungFehler,
  StammdatenKonfliktFehler,
  StammdatenNameVergebenFehler,
} from './stammdaten-storage';

describe('ApiStammdatenStorage', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };
  let storage: ApiStammdatenStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiStammdatenStorage);
  });

  it('lädt und prüft beide Listen, ungültige Zeilen fallen weg', async () => {
    const lager = erzeugeTestLager();
    const artikel = erzeugeTestArtikel({ lagerId: lager.id });
    worker.json.mockImplementation(async (pfad: string) =>
      pfad.endsWith('/lager')
        ? { lager: [lager, { kaputt: true }] }
        : { artikel: [artikel, { einheit: 'Eimer' }] },
    );
    expect(await storage.ladeLager()).toEqual([lager]);
    expect(await storage.ladeArtikel()).toEqual([artikel]);
  });

  it('liefert bei fehlendem Listenfeld eine leere Liste', async () => {
    worker.json.mockResolvedValue({});
    expect(await storage.ladeLager()).toEqual([]);
    expect(await storage.ladeArtikel()).toEqual([]);
  });

  it('puffert die Listen und verwirft den Puffer nach einem Schreibzugriff', async () => {
    worker.json.mockResolvedValue({ lager: [erzeugeTestLager()] });
    await storage.ladeLager();
    await storage.ladeLager();
    expect(worker.json).toHaveBeenCalledOnce();
    const neu = erzeugeTestLager();
    worker.json.mockResolvedValue(neu);
    await storage.speichereLager({ id: neu.id, name: neu.name, plaetze: [] }, null);
    worker.json.mockResolvedValue({ lager: [neu] });
    await storage.ladeLager();
    expect(worker.json).toHaveBeenCalledTimes(3);
  });

  it('legt ein Lager mit If-None-Match: * an und aktualisiert mit If-Match', async () => {
    const lager = erzeugeTestLager({ version: 3 });
    worker.json.mockResolvedValue(lager);
    await storage.speichereLager({ id: lager.id, name: lager.name, plaetze: [] }, null);
    const [pfadNeu, neu] = worker.json.mock.calls[0];
    expect(pfadNeu).toBe('/api/einsatzplanung/lager');
    expect(neu.method).toBe('POST');
    expect(neu.headers.get('If-None-Match')).toBe('*');
    await storage.speichereLager({ id: lager.id, name: lager.name, plaetze: [] }, 2);
    const [pfadAlt, alt] = worker.json.mock.calls[1];
    expect(pfadAlt).toBe(`/api/einsatzplanung/lager/${lager.id}`);
    expect(alt.method).toBe('PUT');
    expect(alt.headers.get('If-Match')).toBe('"2"');
    expect(alt.headers.get('If-None-Match')).toBeNull();
  });

  it('sendet beim Artikel genau die Eingabefelder', async () => {
    const artikel = erzeugeTestArtikel();
    worker.json.mockResolvedValue(artikel);
    await storage.speichereArtikel(
      { id: artikel.id, name: artikel.name, einheit: 'Liter', lagerId: null },
      null,
    );
    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe('/api/einsatzplanung/artikel');
    expect(JSON.parse(optionen.body)).toEqual({
      id: artikel.id,
      name: artikel.name,
      einheit: 'Liter',
      lagerId: null,
    });
  });

  it('weist eine ungültige Antwort des Servers ab', async () => {
    worker.json.mockResolvedValue({ unsinn: true });
    await expect(
      storage.speichereLager({ id: 'x', name: 'A', plaetze: [] }, null),
    ).rejects.toBeInstanceOf(WorkerFehler);
    await expect(
      storage.speichereArtikel({ id: 'x', name: 'A', einheit: 'Stück', lagerId: null }, null),
    ).rejects.toBeInstanceOf(WorkerFehler);
  });

  it('übersetzt 412 in einen Konfliktfehler', async () => {
    worker.json.mockRejectedValue(new WorkerFehler('x', 412));
    await expect(
      storage.speichereLager({ id: 'x', name: 'A', plaetze: [] }, 1),
    ).rejects.toBeInstanceOf(StammdatenKonfliktFehler);
    worker.anfragen.mockRejectedValue(new WorkerFehler('x', 412));
    await expect(storage.loescheArtikel('x', 1)).rejects.toBeInstanceOf(StammdatenKonfliktFehler);
  });

  it('übersetzt vergebene Namen und Nutzung an Hand des Diagnosecodes', async () => {
    worker.json.mockRejectedValue(new WorkerFehler('x', 409, 'EINSATZPLANUNG_NAME_VERGEBEN'));
    await expect(
      storage.speichereLager({ id: 'x', name: 'A', plaetze: [] }, null),
    ).rejects.toMatchObject({
      art: 'lager',
    });
    await expect(
      storage.speichereArtikel({ id: 'x', name: 'A', einheit: 'Stück', lagerId: null }, null),
    ).rejects.toBeInstanceOf(StammdatenNameVergebenFehler);
    worker.anfragen.mockRejectedValue(
      new WorkerFehler('x', 409, 'EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG'),
    );
    await expect(storage.loescheLager('x', 1)).rejects.toBeInstanceOf(StammdatenInNutzungFehler);
  });

  it('lässt andere Fehler unverändert durch', async () => {
    const fehler = new WorkerFehler('Server nicht erreichbar', 0);
    worker.json.mockRejectedValue(fehler);
    await expect(storage.speichereLager({ id: 'x', name: 'A', plaetze: [] }, null)).rejects.toBe(
      fehler,
    );
  });

  it('löscht mit If-Match und verwirft den Puffer', async () => {
    worker.anfragen.mockResolvedValue(new Response(null, { status: 204 }));
    await storage.loescheLager('abc', 4);
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/einsatzplanung/lager/abc');
    expect(optionen.method).toBe('DELETE');
    expect(optionen.headers.get('If-Match')).toBe('"4"');
  });

  it('sendet die Reihenfolge ohne Version und liefert die neue Liste', async () => {
    const a = erzeugeTestLager({ reihenfolge: 1 });
    const b = erzeugeTestLager({ reihenfolge: 2 });
    worker.json.mockResolvedValue({ lager: [a, b] });
    const liste = await storage.setzeLagerReihenfolge([a.id, b.id]);
    expect(liste).toEqual([a, b]);
    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe('/api/einsatzplanung/lager/reihenfolge');
    expect(optionen.method).toBe('PUT');
    expect(JSON.parse(optionen.body)).toEqual({ ids: [a.id, b.id] });
    expect(optionen.headers.get('If-Match')).toBeNull();
  });

  describe('Kisten', () => {
    it('lädt und prüft die Kisten samt Inhalt', async () => {
      const kiste = erzeugeTestKiste({
        inhalt: [{ artikelId: 'a1', menge: 2, bemerkung: 'voll' }],
      });
      worker.json.mockResolvedValue({ kisten: [kiste, { inhalt: 'kaputt' }] });
      expect(await storage.ladeKisten()).toEqual([kiste]);
      await storage.ladeKisten();
      expect(worker.json).toHaveBeenCalledOnce();
      expect(worker.json.mock.calls[0][0]).toBe('/api/einsatzplanung/kisten');
    });

    it('legt mit If-None-Match: * an, ändert mit If-Match und sendet den ganzen Inhalt', async () => {
      const kiste = erzeugeTestKiste({ inhalt: [{ artikelId: 'a1', menge: 1, bemerkung: '' }] });
      worker.json.mockResolvedValue(kiste);
      const eingabe = {
        id: kiste.id,
        name: kiste.name,
        lagerId: null,
        inhalt: kiste.inhalt,
      };
      await storage.speichereKiste(eingabe, null);
      const [pfadNeu, neu] = worker.json.mock.calls[0];
      expect(pfadNeu).toBe('/api/einsatzplanung/kisten');
      expect(neu.headers.get('If-None-Match')).toBe('*');
      await storage.speichereKiste(eingabe, 3);
      const [pfadAlt, alt] = worker.json.mock.calls[1];
      expect(pfadAlt).toBe(`/api/einsatzplanung/kisten/${kiste.id}`);
      expect(alt.headers.get('If-Match')).toBe('"3"');
      expect(JSON.parse(alt.body)).toEqual(eingabe);
    });

    it('weist eine ungültige Antwort ab und übersetzt Konflikt und Namen', async () => {
      worker.json.mockResolvedValue({ x: 1 });
      const eingabe = { id: 'x', name: 'A', lagerId: null, inhalt: [] };
      await expect(storage.speichereKiste(eingabe, null)).rejects.toBeInstanceOf(WorkerFehler);
      worker.json.mockRejectedValue(new WorkerFehler('x', 412));
      await expect(storage.speichereKiste(eingabe, 1)).rejects.toBeInstanceOf(
        StammdatenKonfliktFehler,
      );
      worker.json.mockRejectedValue(new WorkerFehler('x', 409, 'EINSATZPLANUNG_NAME_VERGEBEN'));
      await expect(storage.speichereKiste(eingabe, null)).rejects.toMatchObject({ art: 'kiste' });
    });

    it('löscht mit If-Match', async () => {
      worker.anfragen.mockResolvedValue(new Response(null, { status: 204 }));
      await storage.loescheKiste('abc', 2);
      const [pfad, optionen] = worker.anfragen.mock.calls[0];
      expect(pfad).toBe('/api/einsatzplanung/kisten/abc');
      expect(optionen.headers.get('If-Match')).toBe('"2"');
    });
  });

  it('nennt beim Löschschutz eines Artikels die Kiste', async () => {
    worker.anfragen.mockRejectedValue(
      new WorkerFehler('x', 409, 'EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG'),
    );
    await expect(storage.loescheArtikel('x', 1)).rejects.toMatchObject({
      art: 'artikel',
      message: 'Dieser Artikel ist noch in einer Kiste enthalten.',
    });
    await expect(storage.loescheLager('x', 1)).rejects.toMatchObject({ art: 'lager' });
  });
});
