import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerFehler } from '../../kern/worker-client';
import { PostfachMail } from '../models/postfach.model';
import { ApiPostfachStorage } from '../storage/api-postfach-storage';
import { PostfachStoreService } from './postfach-store.service';

const mail = (id: string): PostfachMail => ({
  id,
  empfangenAm: '2026-11-10T10:00:00Z',
  absender: 'werkstatt@example.org',
  betreff: 'Angebot',
  empfaenger: 'angebote@example.org',
  fahrzeugId: null,
  fahrzeugBezeichnung: null,
  groesse: 1000,
});

describe('PostfachStoreService', () => {
  const storage = {
    mails: vi.fn(),
    adressen: vi.fn(),
    rohmail: vi.fn(),
    verwerfen: vi.fn(),
    ordneZu: vi.fn(),
  };
  let store: PostfachStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiPostfachStorage, useValue: storage }],
    });
    store = TestBed.inject(PostfachStoreService);
  });

  it('lädt die offenen Mails und die Aufbewahrungsfrist', async () => {
    storage.mails.mockResolvedValue({ mails: [mail('a'), mail('b')], aufbewahrungTage: 14 });
    await store.laden();
    expect(store.anzahl()).toBe(2);
    expect(store.aufbewahrungTage()).toBe(14);
    expect(store.fehler()).toBe('');
  });

  it('meldet einen Ladefehler mit Text', async () => {
    storage.mails.mockRejectedValue(new WorkerFehler('x', 503, 'POSTFACH_KONFIGURATION_FEHLT'));
    await store.laden();
    expect(store.fehler()).not.toBe('');
    expect(store.laedt()).toBe(false);
  });

  it('entfernt eine zugeordnete oder verworfene Mail aus der Liste', async () => {
    storage.mails.mockResolvedValue({ mails: [mail('a'), mail('b')], aufbewahrungTage: 30 });
    await store.laden();
    storage.ordneZu.mockResolvedValue(undefined);
    storage.verwerfen.mockResolvedValue(undefined);
    expect(await store.ordneZu('a', 'v-1')).toBe(true);
    expect(await store.verwerfen('b')).toBe(true);
    expect(store.mails()).toEqual([]);
    expect(storage.ordneZu).toHaveBeenCalledWith('a', 'v-1');
  });

  it('behält die Mail bei einem Fehler', async () => {
    storage.mails.mockResolvedValue({ mails: [mail('a')], aufbewahrungTage: 30 });
    await store.laden();
    storage.ordneZu.mockRejectedValue(new WorkerFehler('x', 409, 'VORGANG_ANGEBOT_GESPERRT'));
    expect(await store.ordneZu('a', 'v-1')).toBe(false);
    expect(store.mails()).toHaveLength(1);
    expect(store.fehler()).not.toBe('');
  });

  it('lädt die Adressen nur einmal', async () => {
    storage.adressen.mockResolvedValue({ sammelAdresse: 'angebote@example.org', adressen: [] });
    await store.adressenLaden();
    await store.adressenLaden();
    expect(storage.adressen).toHaveBeenCalledTimes(1);
  });
});
