import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { erzeugeTestPreiskatalogEintrag } from '../testing/preiskatalog-testdaten';
import { ApiPreiskatalogStorage } from './api-preiskatalog-storage';
import { PreiskatalogKonfliktFehler } from './preiskatalog-storage';

describe('ApiPreiskatalogStorage', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };
  let storage: ApiPreiskatalogStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    storage = TestBed.inject(ApiPreiskatalogStorage);
  });

  it('lädt und prüft die Liste, bevor sie an die Fachschicht geht', async () => {
    const eintrag = erzeugeTestPreiskatalogEintrag();
    worker.json.mockResolvedValue({ eintraege: [eintrag, { unvollstaendig: true }] });
    const ergebnis = await storage.ladeEintraege();
    expect(ergebnis).toEqual([eintrag]);
  });

  it('ruft dieselbe Liste nicht bei jedem Seitenwechsel erneut ab', async () => {
    worker.json.mockResolvedValue({ eintraege: [erzeugeTestPreiskatalogEintrag()] });
    await storage.ladeEintraege();
    await storage.ladeEintraege();
    expect(worker.json).toHaveBeenCalledOnce();
  });

  it('legt einen neuen Eintrag mit If-None-Match: * an', async () => {
    const eintrag = erzeugeTestPreiskatalogEintrag();
    worker.json.mockResolvedValue(eintrag);
    const ergebnis = await storage.speichereEintrag(
      {
        id: eintrag.id,
        bezeichnung: eintrag.bezeichnung,
        art: eintrag.art,
        einzelpreisCent: eintrag.einzelpreisCent,
      },
      null,
    );
    expect(ergebnis).toEqual(eintrag);
    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe('/api/angebotswesen/preiskatalog');
    expect(optionen.method).toBe('POST');
    expect(optionen.headers.get('If-None-Match')).toBe('*');
  });

  it('aktualisiert mit der zuletzt gelesenen Version über If-Match', async () => {
    const eintrag = erzeugeTestPreiskatalogEintrag({ version: 2 });
    worker.json.mockResolvedValue(eintrag);
    await storage.speichereEintrag(
      {
        id: eintrag.id,
        bezeichnung: eintrag.bezeichnung,
        art: eintrag.art,
        einzelpreisCent: eintrag.einzelpreisCent,
      },
      1,
    );
    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe(`/api/angebotswesen/preiskatalog/${eintrag.id}`);
    expect(optionen.method).toBe('PUT');
    expect(optionen.headers.get('If-Match')).toBe('"1"');
  });

  it('übersetzt einen 412er in PreiskatalogKonfliktFehler und verwirft die Liste nicht fälschlich', async () => {
    worker.json.mockRejectedValue(new WorkerFehler('Konflikt', 412));
    await expect(
      storage.speichereEintrag(
        { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1000 },
        1,
      ),
    ).rejects.toBeInstanceOf(PreiskatalogKonfliktFehler);
  });

  it('verwirft die gepufferte Liste nach dem Speichern', async () => {
    worker.json.mockResolvedValueOnce({ eintraege: [] });
    await storage.ladeEintraege();
    const eintrag = erzeugeTestPreiskatalogEintrag();
    worker.json.mockResolvedValueOnce(eintrag);
    await storage.speichereEintrag(
      {
        id: eintrag.id,
        bezeichnung: eintrag.bezeichnung,
        art: eintrag.art,
        einzelpreisCent: eintrag.einzelpreisCent,
      },
      null,
    );
    worker.json.mockResolvedValueOnce({ eintraege: [eintrag] });
    await storage.ladeEintraege();
    expect(worker.json).toHaveBeenCalledTimes(3);
  });

  it('löscht einen Eintrag und verwirft die gepufferte Liste', async () => {
    worker.anfragen.mockResolvedValue(new Response(null, { status: 204 }));
    await storage.loescheEintrag('x');
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe('/api/angebotswesen/preiskatalog/x');
    expect(optionen.method).toBe('DELETE');
  });
});
