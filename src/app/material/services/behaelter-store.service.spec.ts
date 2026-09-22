import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBehaelterStorage } from '../storage/api-behaelter-storage';
import { BehaelterInBenutzungFehler, BehaelterKonfliktFehler } from '../storage/behaelter-storage';
import { erzeugeTestbehaelter, erzeugeTestuebersicht } from '../testing/material-testdaten';
import { BehaelterStoreService } from './behaelter-store.service';

describe('BehaelterStoreService', () => {
  const storage = {
    ladeUebersicht: vi.fn(),
    ladeBehaelter: vi.fn(),
    speichereBehaelter: vi.fn(),
    loescheBehaelter: vi.fn(),
  };
  let service: BehaelterStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiBehaelterStorage, useValue: storage }],
    });
    service = TestBed.inject(BehaelterStoreService);
  });

  it('gruppiert die Übersicht nach Fahrzeug und behält die Reihenfolge des Servers', async () => {
    storage.ladeUebersicht.mockResolvedValue([
      erzeugeTestuebersicht({ id: 'b1', fahrzeugId: 'f1', bezeichnung: 'NFR 1' }),
      erzeugeTestuebersicht({ id: 'b2', fahrzeugId: 'f1', bezeichnung: 'NFR 2' }),
      erzeugeTestuebersicht({
        id: 'b3',
        fahrzeugId: 'f2',
        fahrzeugBezeichnung: 'KTW-B Übung',
        bezeichnung: 'NFR 9',
      }),
    ]);
    await service.uebersichtLaden();

    const gruppen = service.nachFahrzeug();
    expect(gruppen).toHaveLength(2);
    expect(gruppen[0]?.bezeichnung).toBe('GW SAN Übung');
    expect(gruppen[0]?.behaelter).toHaveLength(2);
    expect(gruppen[1]?.bezeichnung).toBe('KTW-B Übung');
  });

  it('meldet einen Ladefehler, statt ihn zu werfen', async () => {
    storage.ladeUebersicht.mockRejectedValue(new Error('kaputt'));
    await service.uebersichtLaden();
    expect(service.listeFehler()).toBe('kaputt');
  });

  it('legt einen neuen Behälter ohne Version an und übernimmt eine Vorauswahl', async () => {
    service.neuerBehaelter('f1', 'v1');
    expect(service.entwurf()?.fahrzeugId).toBe('f1');
    expect(service.entwurf()?.vorlageId).toBe('v1');
    storage.speichereBehaelter.mockResolvedValue('"1"');
    await service.speichern();
    expect(storage.speichereBehaelter).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('setzt die Konfliktmarke nur bei einem Versionskonflikt', async () => {
    storage.ladeBehaelter.mockResolvedValue({ daten: erzeugeTestbehaelter(), version: '"2"' });
    await service.behaelterLaden('behaelter-1');
    storage.speichereBehaelter.mockRejectedValue(new BehaelterKonfliktFehler('behaelter-1'));
    await service.speichern();
    expect(service.speicherKonflikt()).toBe(true);

    storage.speichereBehaelter.mockRejectedValue(new Error('Netz weg'));
    await service.speichern();
    expect(service.speicherKonflikt()).toBe(false);
  });

  it('entfernt einen gelöschten Behälter aus der Übersicht', async () => {
    storage.ladeUebersicht.mockResolvedValue([
      erzeugeTestuebersicht({ id: 'b1' }),
      erzeugeTestuebersicht({ id: 'b2' }),
    ]);
    await service.uebersichtLaden();
    storage.loescheBehaelter.mockResolvedValue(undefined);
    expect(await service.behaelterLoeschen('b1')).toBe(true);
    expect(service.uebersicht().map((e) => e.id)).toEqual(['b2']);
  });

  it('behält den Behälter in der Übersicht, wenn Checks sein Löschen verhindern', async () => {
    storage.ladeUebersicht.mockResolvedValue([erzeugeTestuebersicht({ id: 'b1' })]);
    await service.uebersichtLaden();
    storage.loescheBehaelter.mockRejectedValue(new BehaelterInBenutzungFehler('b1'));
    expect(await service.behaelterLoeschen('b1')).toBe(false);
    expect(service.uebersicht()).toHaveLength(1);
    expect(service.loeschFehler()).toContain('Checks');
  });
});
