import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckEinreichung } from '../models/einreichung.model';
import { ApiEinreichungStorage } from '../storage/api-einreichung-storage';
import { EinreichungStoreService } from './einreichung-store.service';

function einreichung(ueberschreibung: Partial<CheckEinreichung> = {}): CheckEinreichung {
  return {
    id: 'e1',
    behaelterId: 'b1',
    behaelterBezeichnung: 'NFR 3',
    fahrzeugBezeichnung: 'GW SAN Übung',
    vorlageBezeichnung: 'Erfundene Prüfvorlage',
    geprueftAm: '2026-09-20',
    eingereichtAm: '2026-09-20T10:00:00.000Z',
    eingereichtVonName: 'A. Person',
    verfallsdatumErfasst: true,
    bemerkung: '',
    positionenGesamt: 5,
    positionenGeprueft: 5,
    fehlmengen: 1,
    unbrauchbar: 0,
    abgelaufen: 0,
    ...ueberschreibung,
  };
}

describe('EinreichungStoreService', () => {
  const storage = {
    ladeOffene: vi.fn(),
    ladeEinreichung: vi.fn(),
    gibFrei: vi.fn(),
    lehneAb: vi.fn(),
  };
  let service: EinreichungStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiEinreichungStorage, useValue: storage }],
    });
    service = TestBed.inject(EinreichungStoreService);
  });

  it('meldet einen Ladefehler, statt ihn zu werfen', async () => {
    storage.ladeOffene.mockRejectedValue(new Error('kaputt'));
    await service.laden();
    expect(service.fehler()).toBe('kaputt');
  });

  it('wählt alle aus und wieder ab', async () => {
    storage.ladeOffene.mockResolvedValue([einreichung(), einreichung({ id: 'e2' })]);
    await service.laden();
    service.alleUmschalten();
    expect(service.anzahlAusgewaehlt()).toBe(2);
    expect(service.alleAusgewaehlt()).toBe(true);
    service.alleUmschalten();
    expect(service.anzahlAusgewaehlt()).toBe(0);
  });

  it('nimmt eine zwischenzeitlich entschiedene Meldung aus der Auswahl', async () => {
    storage.ladeOffene.mockResolvedValue([einreichung(), einreichung({ id: 'e2' })]);
    await service.laden();
    service.alleUmschalten();

    // Beim nächsten Laden ist e2 verschwunden.
    storage.ladeOffene.mockResolvedValue([einreichung()]);
    await service.laden();
    expect([...service.ausgewaehlt()]).toEqual(['e1']);
  });

  it('meldet das Ergebnis je Eintrag, nicht pauschal "erfolgreich"', async () => {
    storage.ladeOffene.mockResolvedValue([einreichung(), einreichung({ id: 'e2' })]);
    await service.laden();
    service.alleUmschalten();
    storage.gibFrei.mockResolvedValue([
      { id: 'e1', status: 'freigegeben' },
      { id: 'e2', status: 'nicht-erlaubt' },
    ]);
    storage.ladeOffene.mockResolvedValue([einreichung({ id: 'e2' })]);

    expect(await service.freigeben()).toBe(true);
    expect(service.meldung()).toContain('1 freigegeben');
    expect(service.meldung()).toContain('1 dafür fehlt die Berechtigung');
    expect(service.anzahlAusgewaehlt()).toBe(0);
  });

  it('meldet einen Durchlauf ohne einzige Freigabe als nicht erfolgreich', async () => {
    storage.ladeOffene.mockResolvedValue([einreichung()]);
    await service.laden();
    service.auswahlUmschalten('e1');
    storage.gibFrei.mockResolvedValue([{ id: 'e1', status: 'nicht-offen' }]);
    expect(await service.freigeben()).toBe(false);
  });

  it('gibt ohne Auswahl nichts frei', async () => {
    expect(await service.freigeben()).toBe(false);
    expect(storage.gibFrei).not.toHaveBeenCalled();
  });

  it('lädt eine vollständige Meldung nur einmal nach', async () => {
    storage.ladeEinreichung.mockResolvedValue({ ...einreichung(), grundlage: '', positionen: [] });
    await service.detailLaden('e1');
    await service.detailLaden('e1');
    expect(storage.ladeEinreichung).toHaveBeenCalledTimes(1);
  });

  it('meldet einen Ablehnungsfehler, statt ihn zu werfen', async () => {
    storage.ladeOffene.mockResolvedValue([]);
    storage.lehneAb.mockRejectedValue(new Error('schon entschieden'));
    expect(await service.ablehnen('e1', 'Grund')).toBe(false);
    expect(service.fehler()).toBe('schon entschieden');
  });
});
