import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erzeugeTestablesung } from '../testing/fahrzeug-testdaten';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import { AblesungStoreService } from './ablesung-store.service';

describe('AblesungStoreService', () => {
  const storage = { ladeAblesungen: vi.fn(), ergaenzeAblesung: vi.fn() };
  let service: AblesungStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiFahrzeugStorage, useValue: storage }],
    });
    service = TestBed.inject(AblesungStoreService);
  });

  it('lädt Ablesungen sortiert nach Datum und meldet Fehler statt zu werfen', async () => {
    const neu = erzeugeTestablesung({ abgelesenAm: '2026-06-01', stand: 200 });
    const alt = erzeugeTestablesung({ abgelesenAm: '2026-01-01', stand: 100 });
    storage.ladeAblesungen.mockResolvedValue([neu, alt]);
    await service.laden('f1');
    expect(service.ablesungen().map((a) => a.abgelesenAm)).toEqual(['2026-01-01', '2026-06-01']);
    expect(service.letzteAblesung()?.stand).toBe(200);

    storage.ladeAblesungen.mockRejectedValue(new Error('kaputt'));
    await service.laden('f1');
    expect(service.fehler()).toBe('kaputt');
  });

  it('hängt eine neue Ablesung an und hält die Liste sortiert', async () => {
    const eingabe = {
      fahrzeugId: 'f1',
      abgelesenAm: '2026-03-01',
      stand: 150,
      quelle: 'qr' as const,
      korrigiert: null,
      bemerkung: '',
    };
    storage.ergaenzeAblesung.mockResolvedValue(erzeugeTestablesung({ ...eingabe, id: 'neu' }));
    const erfolg = await service.erfassen(eingabe);
    expect(erfolg).toBe(true);
    expect(service.ablesungen()).toHaveLength(1);
    expect(service.erfassungsFehler()).toBe('');
  });

  it('meldet einen Fehler bei der Erfassung, statt zu werfen', async () => {
    storage.ergaenzeAblesung.mockRejectedValue(new Error('Server nicht erreichbar'));
    const erfolg = await service.erfassen({
      fahrzeugId: 'f1',
      abgelesenAm: '2026-03-01',
      stand: 150,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    expect(erfolg).toBe(false);
    expect(service.erfassungsFehler()).toBe('Server nicht erreichbar');
  });
});
