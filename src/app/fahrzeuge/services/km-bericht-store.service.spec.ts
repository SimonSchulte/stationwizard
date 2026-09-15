import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KmBericht, VersandQuittung } from '../models/km-bericht.model';
import { ApiKmBerichtStorage } from '../storage/api-km-bericht-storage';
import { VersandNichtMoeglichFehler } from '../storage/km-bericht-storage';
import { KmBerichtStoreService } from './km-bericht-store.service';

const BERICHT: KmBericht = {
  stichtag: '2026-06-15',
  jahr: 2026,
  zeilen: [],
  ohneAblesung: 0,
  unterSoll: 0,
};

const QUITTUNG: VersandQuittung = {
  gesendetAn: 'leitung@example.test',
  gesendetAm: '2026-06-15T10:00:00.000Z',
  gesendetVon: 'person@example.test',
  anzahlFahrzeuge: 0,
  versandweg: 'email-routing',
};

describe('KmBerichtStoreService', () => {
  const storage = { ladeBericht: vi.fn(), sendeBericht: vi.fn() };
  let service: KmBerichtStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiKmBerichtStorage, useValue: storage }],
    });
    service = TestBed.inject(KmBerichtStoreService);
  });

  it('lädt den Bericht und meldet einen Fehler, statt zu werfen', async () => {
    storage.ladeBericht.mockResolvedValue(BERICHT);
    await service.berichtLaden();
    expect(service.bericht()).toEqual(BERICHT);
    expect(service.ladeFehler()).toBe('');

    storage.ladeBericht.mockRejectedValue(new Error('kaputt'));
    await service.berichtLaden();
    expect(service.ladeFehler()).toBe('kaputt');
  });

  it('setzt die Quittung erst nach bestätigtem Versand', async () => {
    storage.sendeBericht.mockResolvedValue(QUITTUNG);
    expect(await service.senden()).toBe(true);
    expect(service.quittung()).toEqual(QUITTUNG);
    expect(service.sendeFehler()).toBe('');
    expect(service.sendet()).toBe(false);
  });

  it('behält keine Quittung, wenn der Versand scheitert', async () => {
    storage.sendeBericht.mockResolvedValue(QUITTUNG);
    await service.senden();

    storage.sendeBericht.mockRejectedValue(
      new VersandNichtMoeglichFehler('Es ist keine Empfängeradresse hinterlegt.'),
    );
    expect(await service.senden()).toBe(false);
    expect(service.quittung()).toBeNull();
    expect(service.sendeFehler()).toBe('Es ist keine Empfängeradresse hinterlegt.');
  });
});
