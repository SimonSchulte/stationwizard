import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Benutzerkontext } from '../../kern/benutzerkontext';
import { Benutzerkonto } from '../models/benutzerkonto.model';
import { ApiBenutzerverwaltungStorage } from '../storage/api-benutzerverwaltung-storage';
import { BenutzerverwaltungStoreService } from './benutzerverwaltung-store.service';

function testkonto(ueberschreibung: Partial<Benutzerkonto> = {}): Benutzerkonto {
  return {
    email: 'person@example.test',
    rolle: null,
    sonderrollen: [],
    ersterZugriffAm: '2026-01-01T00:00:00.000Z',
    letzterZugriffAm: '2026-01-02T00:00:00.000Z',
    rolleGeaendertAm: null,
    rolleGeaendertVon: null,
    ...ueberschreibung,
  };
}

describe('BenutzerverwaltungStoreService', () => {
  const storage = { ladeBenutzer: vi.fn(), rolleSetzen: vi.fn() };
  let service: BenutzerverwaltungStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiBenutzerverwaltungStorage, useValue: storage }],
    });
    service = TestBed.inject(BenutzerverwaltungStoreService);
  });

  it('lädt die Liste und meldet Fehler statt zu werfen', async () => {
    storage.ladeBenutzer.mockResolvedValue([testkonto()]);
    await service.listeLaden();
    expect(service.benutzer()).toHaveLength(1);
    expect(service.listeFehler()).toBe('');

    storage.ladeBenutzer.mockRejectedValue(new Error('kaputt'));
    await service.listeLaden();
    expect(service.listeFehler()).toBe('kaputt');
  });

  it('aktualisiert den betroffenen Eintrag in der Liste nach dem Setzen der Rolle', async () => {
    storage.ladeBenutzer.mockResolvedValue([
      testkonto({ email: 'a@example.test' }),
      testkonto({ email: 'b@example.test' }),
    ]);
    await service.listeLaden();

    const aktualisiert = testkonto({ email: 'a@example.test', rolle: 'helfer' });
    storage.rolleSetzen.mockResolvedValue(aktualisiert);
    const erfolg = await service.rolleSetzen('a@example.test', 'helfer', []);

    expect(erfolg).toBe(true);
    expect(service.benutzer().find((b) => b.email === 'a@example.test')?.rolle).toBe('helfer');
    expect(service.benutzer().find((b) => b.email === 'b@example.test')?.rolle).toBeNull();
    expect(service.speichertFuer()).toBe('');
  });

  it('meldet einen Speicherfehler, ohne die Liste zu verändern', async () => {
    storage.ladeBenutzer.mockResolvedValue([testkonto()]);
    await service.listeLaden();

    storage.rolleSetzen.mockRejectedValue(
      new Error('Diese Person hat sich noch nicht angemeldet.'),
    );
    const erfolg = await service.rolleSetzen('person@example.test', 'helfer', []);

    expect(erfolg).toBe(false);
    expect(service.speicherFehler()).toBe('Diese Person hat sich noch nicht angemeldet.');
    expect(service.benutzer()[0].rolle).toBeNull();
  });
});

describe('BenutzerverwaltungStoreService – eigene Rolle', () => {
  const storage = { ladeBenutzer: vi.fn(), rolleSetzen: vi.fn() };
  const email = signal('');
  let service: BenutzerverwaltungStoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    email.set('');
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiBenutzerverwaltungStorage, useValue: storage },
        { provide: Benutzerkontext, useValue: { email } },
      ],
    });
    service = TestBed.inject(BenutzerverwaltungStoreService);
  });

  it('ist ohne geladene Liste weder ermittelbar noch Zugführung', () => {
    email.set('fuehrung@example.test');
    expect(service.eigeneRolle()).toBeNull();
    expect(service.istZugfuehrung()).toBe(false);
  });

  it('erkennt die eigene Rolle Zugführung nach dem Laden der Liste', async () => {
    email.set('fuehrung@example.test');
    storage.ladeBenutzer.mockResolvedValue([
      testkonto({ email: 'fuehrung@example.test', rolle: 'zugfuehrung' }),
      testkonto({ email: 'helfer@example.test', rolle: 'helfer' }),
    ]);
    await service.listeLaden();

    expect(service.eigeneRolle()).toBe('zugfuehrung');
    expect(service.istZugfuehrung()).toBe(true);
  });

  it('ist nicht Zugführung mit einer anderen Rolle', async () => {
    email.set('helfer@example.test');
    storage.ladeBenutzer.mockResolvedValue([
      testkonto({ email: 'helfer@example.test', rolle: 'helfer' }),
    ]);
    await service.listeLaden();

    expect(service.istZugfuehrung()).toBe(false);
  });
});
