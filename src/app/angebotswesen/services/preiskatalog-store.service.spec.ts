import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erzeugeTestPreiskatalogEintrag } from '../testing/preiskatalog-testdaten';
import { ApiPreiskatalogStorage } from '../storage/api-preiskatalog-storage';
import { PreiskatalogKonfliktFehler } from '../storage/preiskatalog-storage';
import { PreiskatalogStoreService } from './preiskatalog-store.service';

describe('PreiskatalogStoreService', () => {
  const storage = {
    ladeEintraege: vi.fn(),
    speichereEintrag: vi.fn(),
    loescheEintrag: vi.fn(),
  };
  let service: PreiskatalogStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiPreiskatalogStorage, useValue: storage }],
    });
    service = TestBed.inject(PreiskatalogStoreService);
  });

  it('lädt die Liste sortiert und meldet Fehler statt zu werfen', async () => {
    storage.ladeEintraege.mockResolvedValue([
      erzeugeTestPreiskatalogEintrag({ bezeichnung: 'RH/RS' }),
      erzeugeTestPreiskatalogEintrag({ bezeichnung: 'GW-San' }),
    ]);
    await service.laden();
    expect(service.eintraege().map((e) => e.bezeichnung)).toEqual(['GW-San', 'RH/RS']);

    storage.ladeEintraege.mockRejectedValue(new Error('kaputt'));
    await service.laden();
    expect(service.listeFehler()).toBe('kaputt');
  });

  it('speichert eine neue Zeile und fügt sie sortiert in die Liste ein', async () => {
    const gespeichert = erzeugeTestPreiskatalogEintrag({ bezeichnung: 'Notarzt' });
    storage.speichereEintrag.mockResolvedValue(gespeichert);
    const erfolg = await service.eintragSpeichern(
      { id: gespeichert.id, bezeichnung: 'Notarzt', art: 'einsatzkraft', einzelpreisCent: 5000 },
      null,
    );
    expect(erfolg).toBe(true);
    expect(service.eintraege()).toContainEqual(gespeichert);
  });

  it('meldet einen Konflikt separat, ohne die Liste zu verändern', async () => {
    storage.speichereEintrag.mockRejectedValue(new PreiskatalogKonfliktFehler('x'));
    const erfolg = await service.eintragSpeichern(
      { id: 'x', bezeichnung: 'Test', art: 'einsatzkraft', einzelpreisCent: 1000 },
      1,
    );
    expect(erfolg).toBe(false);
    expect(service.speicherKonflikt()).toBe(true);
  });

  it('löscht eine Zeile aus der lokalen Liste', async () => {
    const eintrag = erzeugeTestPreiskatalogEintrag();
    storage.ladeEintraege.mockResolvedValue([eintrag]);
    await service.laden();
    storage.loescheEintrag.mockResolvedValue(undefined);
    const erfolg = await service.eintragLoeschen(eintrag.id);
    expect(erfolg).toBe(true);
    expect(service.eintraege()).toHaveLength(0);
  });
});
