import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiPruefvorlageStorage } from '../storage/api-pruefvorlage-storage';
import { VorlageInBenutzungFehler, VorlageKonfliktFehler } from '../storage/pruefvorlage-storage';
import { erzeugeTestvorlage } from '../testing/material-testdaten';
import { PruefvorlageStoreService, neuerArtikel } from './pruefvorlage-store.service';

describe('PruefvorlageStoreService', () => {
  const storage = {
    ladeKoepfe: vi.fn(),
    ladeVorlage: vi.fn(),
    speichereVorlage: vi.fn(),
    loescheVorlage: vi.fn(),
  };
  let service: PruefvorlageStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiPruefvorlageStorage, useValue: storage }],
    });
    service = TestBed.inject(PruefvorlageStoreService);
  });

  it('meldet einen Ladefehler, statt ihn zu werfen', async () => {
    storage.ladeKoepfe.mockRejectedValue(new Error('kaputt'));
    await service.listeLaden();
    expect(service.listeFehler()).toBe('kaputt');
    expect(service.listeLaedt()).toBe(false);
  });

  it('gilt direkt nach dem Laden als unverändert', async () => {
    storage.ladeVorlage.mockResolvedValue({ daten: erzeugeTestvorlage(), version: '"3"' });
    await service.vorlageLaden('vorlage-1');
    expect(service.hatUngesicherteAenderungen()).toBe(false);
    expect(service.istNeu()).toBe(false);
  });

  it('erkennt eine Änderung am Entwurf als ungesichert', async () => {
    storage.ladeVorlage.mockResolvedValue({ daten: erzeugeTestvorlage(), version: '"3"' });
    await service.vorlageLaden('vorlage-1');
    service.entwurfAendern((vorlage) => {
      vorlage.faecher[0]!.artikel.push(neuerArtikel());
      return vorlage;
    });
    expect(service.hatUngesicherteAenderungen()).toBe(true);
  });

  it('sendet beim Speichern die geladene Version mit und übernimmt die neue', async () => {
    storage.ladeVorlage.mockResolvedValue({ daten: erzeugeTestvorlage(), version: '"3"' });
    await service.vorlageLaden('vorlage-1');
    storage.speichereVorlage.mockResolvedValue('"4"');

    expect(await service.speichern()).toBe(true);
    expect(storage.speichereVorlage).toHaveBeenCalledWith(expect.anything(), '"3"');
    expect(service.geladen()?.version).toBe('"4"');
    expect(service.hatUngesicherteAenderungen()).toBe(false);
  });

  it('legt eine neue Vorlage ohne Version an', async () => {
    service.neueVorlage();
    storage.speichereVorlage.mockResolvedValue('"1"');
    await service.speichern();
    expect(storage.speichereVorlage).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('setzt die Konfliktmarke nur bei einem Versionskonflikt, weil nur dort Neuladen hilft', async () => {
    service.neueVorlage();
    storage.speichereVorlage.mockRejectedValue(new VorlageKonfliktFehler('vorlage-1'));
    expect(await service.speichern()).toBe(false);
    expect(service.speicherKonflikt()).toBe(true);

    storage.speichereVorlage.mockRejectedValue(new Error('Netz weg'));
    await service.speichern();
    expect(service.speicherKonflikt()).toBe(false);
    expect(service.speicherFehler()).toBe('Netz weg');
  });

  it('behält den Entwurf, wenn das Speichern scheitert', async () => {
    storage.ladeVorlage.mockResolvedValue({ daten: erzeugeTestvorlage(), version: '"3"' });
    await service.vorlageLaden('vorlage-1');
    service.entwurfAendern((vorlage) => ({ ...vorlage, bezeichnung: 'Neuer Name' }));
    storage.speichereVorlage.mockRejectedValue(new Error('Netz weg'));

    await service.speichern();
    expect(service.entwurf()?.bezeichnung).toBe('Neuer Name');
    expect(service.hatUngesicherteAenderungen()).toBe(true);
  });

  it('meldet beim Löschen einer benutzten Vorlage deren eigenen Grund', async () => {
    storage.ladeKoepfe.mockResolvedValue([]);
    storage.loescheVorlage.mockRejectedValue(new VorlageInBenutzungFehler('vorlage-1'));
    expect(await service.vorlageLoeschen('vorlage-1')).toBe(false);
    expect(service.loeschFehler()).toContain('Behälter');
    expect(service.loeschtId()).toBeNull();
  });
});
