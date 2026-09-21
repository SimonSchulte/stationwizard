import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pruefauftrag } from '../models/check.model';
import { ApiCheckStorage } from '../storage/api-check-storage';
import { CheckUnschluessigFehler } from '../storage/check-storage';
import { CheckStoreService } from './check-store.service';
import { merkeEntwurf } from './check-entwurf';

function auftrag(): Pruefauftrag {
  return {
    behaelter: {
      id: 'b1',
      bezeichnung: 'NFR 1',
      bemerkung: '',
      fahrzeugBezeichnung: 'GW SAN Übung',
      fahrzeugFunkrufname: 'Florian Testort 1/59/1',
      fahrzeugGruppe: 'sanitaet',
    },
    vorlage: {
      id: 'v1',
      bezeichnung: 'Erfundene Prüfvorlage',
      grundlage: 'Erfundene Grundlage',
      version: 1,
      faecher: [
        {
          id: 'f1',
          bezeichnung: 'Erstes Fach',
          artikel: [
            {
              id: 'a1',
              bezeichnung: 'Erfundene Binde',
              sollMenge: 2,
              einheit: '',
              herkunft: 'land',
              verfallsdatumPflicht: true,
            },
            {
              id: 'a2',
              bezeichnung: 'Erfundene Schere',
              sollMenge: 1,
              einheit: '',
              herkunft: 'seg',
              verfallsdatumPflicht: false,
            },
          ],
        },
      ],
    },
  };
}

describe('CheckStoreService', () => {
  const storage = {
    ladePruefauftrag: vi.fn(),
    ladeHistorie: vi.fn(),
    ladeCheck: vi.fn(),
    reicheCheckEin: vi.fn(),
  };
  let service: CheckStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiCheckStorage, useValue: storage }],
    });
    service = TestBed.inject(CheckStoreService);
  });

  afterEach(() => vi.useRealTimers());

  it('legt beim Laden einen leeren Stand an, wenn es keinen Entwurf gibt', async () => {
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    expect(service.stand()?.positionen['a1']?.istMenge).toBe(2);
    expect(service.entwurfGefundenAm()).toBeNull();
    expect(service.einreichbar()).toBe(false);
  });

  it('nimmt einen auf dem Gerät gesicherten Entwurf wieder auf', async () => {
    merkeEntwurf({
      behaelterId: 'b1',
      verfallsdatumErfasst: true,
      bemerkung: 'halb fertig',
      positionen: {
        a1: {
          artikelId: 'a1',
          geprueft: true,
          istMenge: 1,
          unbrauchbar: false,
          verfallsdaten: [null, null],
        },
        a2: {
          artikelId: 'a2',
          geprueft: false,
          istMenge: 1,
          unbrauchbar: false,
          verfallsdaten: [null],
        },
      },
    });
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    expect(service.stand()?.bemerkung).toBe('halb fertig');
    expect(service.entwurfGefundenAm()).not.toBeNull();
    expect(service.fortschritt()?.geprueft).toBe(1);
  });

  it('verwirft einen Entwurf, der nicht mehr zur Vorlage passt, statt ihn halb zu übernehmen', async () => {
    merkeEntwurf({
      behaelterId: 'b1',
      verfallsdatumErfasst: true,
      bemerkung: 'veraltet',
      // Die Vorlage führt inzwischen zwei Artikel; dieser Entwurf kennt nur einen.
      positionen: {
        a1: {
          artikelId: 'a1',
          geprueft: true,
          istMenge: 2,
          unbrauchbar: false,
          verfallsdaten: [null, null],
        },
      },
    });
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    expect(service.stand()?.bemerkung).toBe('');
    expect(service.entwurfGefundenAm()).toBeNull();
  });

  it('meldet einen unbekannten Behälter, statt einen leeren Check anzubieten', async () => {
    storage.ladePruefauftrag.mockResolvedValue(null);
    await service.auftragLaden('b1');
    expect(service.ladeFehler()).toBe('Behälter nicht gefunden.');
    expect(service.stand()).toBeNull();
  });

  it('gibt den Abschluss erst frei, wenn mindestens eine Position geprüft ist', async () => {
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    expect(service.einreichbar()).toBe(false);
    service.positionAendern('a1', { geprueft: true });
    expect(service.einreichbar()).toBe(true);
  });

  it('setzt mit "alles auf Soll" jede Position auf das Soll und hakt sie ab', async () => {
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    service.positionAendern('a1', { istMenge: 0, unbrauchbar: true });
    service.allesAufSoll();
    const stand = service.stand();
    expect(stand?.positionen['a1']?.istMenge).toBe(2);
    expect(stand?.positionen['a1']?.unbrauchbar).toBe(false);
    expect(service.fortschritt()?.prozent).toBe(100);
  });

  it('übernimmt ein Verfallsdatum auf Wunsch für alle Stück', async () => {
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    service.verfallsdatumFuerAlle('a1', '2027-06');
    expect(service.stand()?.positionen['a1']?.verfallsdaten).toEqual(['2027-06', '2027-06']);
  });

  it('setzt ein einzelnes Stück, ohne die übrigen zu verändern', async () => {
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    service.verfallsdatumFuerAlle('a1', '2027-06');
    service.verfallsdatumSetzen('a1', 1, '2026-01');
    expect(service.stand()?.positionen['a1']?.verfallsdaten).toEqual(['2027-06', '2026-01']);
  });

  it('sendet beim Einreichen alle Positionen und räumt den Entwurf ab', async () => {
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    service.positionAendern('a1', { geprueft: true });
    storage.reicheCheckEin.mockResolvedValue({ id: 'c1' });

    const check = await service.einreichen();
    expect(check).not.toBeNull();
    const [behaelterId, eingabe] = storage.reicheCheckEin.mock.calls[0]!;
    expect(behaelterId).toBe('b1');
    expect(eingabe.positionen).toHaveLength(2);
    expect(service.stand()).toBeNull();
    expect(localStorage.getItem('stationwizard.materialcheck.b1')).toBeNull();
  });

  it('behält den Stand, wenn das Einreichen scheitert', async () => {
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    service.positionAendern('a1', { geprueft: true });
    storage.reicheCheckEin.mockRejectedValue(new CheckUnschluessigFehler('passt nicht'));

    expect(await service.einreichen()).toBeNull();
    expect(service.einreichFehler()).toBe('passt nicht');
    expect(service.stand()).not.toBeNull();
  });

  it('sichert den Stand erst nach kurzer Ruhe auf dem Gerät, nicht bei jedem Tastendruck', async () => {
    vi.useFakeTimers();
    storage.ladePruefauftrag.mockResolvedValue(auftrag());
    await service.auftragLaden('b1');
    service.positionAendern('a1', { geprueft: true });
    expect(localStorage.getItem('stationwizard.materialcheck.b1')).toBeNull();
    vi.advanceTimersByTime(2500);
    expect(localStorage.getItem('stationwizard.materialcheck.b1')).not.toBeNull();
  });
});
