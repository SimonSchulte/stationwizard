import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erzeugeTestaenderung } from '../testing/fahrzeug-testdaten';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import { AenderungsprotokollStoreService } from './aenderungsprotokoll-store.service';

describe('AenderungsprotokollStoreService', () => {
  const storage = { ladeAenderungen: vi.fn() };
  let service: AenderungsprotokollStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiFahrzeugStorage, useValue: storage }],
    });
    service = TestBed.inject(AenderungsprotokollStoreService);
  });

  it('lädt das Änderungsprotokoll eines Fahrzeugs', async () => {
    const eintrag = erzeugeTestaenderung();
    storage.ladeAenderungen.mockResolvedValue([eintrag]);
    await service.laden('f1');
    expect(service.eintraege()).toEqual([eintrag]);
    expect(storage.ladeAenderungen).toHaveBeenCalledWith('f1');
  });

  it('meldet einen Fehler beim Laden, statt zu werfen', async () => {
    storage.ladeAenderungen.mockRejectedValue(new Error('Server nicht erreichbar'));
    await service.laden('f1');
    expect(service.fehler()).toBe('Server nicht erreichbar');
    expect(service.eintraege()).toEqual([]);
  });
});
