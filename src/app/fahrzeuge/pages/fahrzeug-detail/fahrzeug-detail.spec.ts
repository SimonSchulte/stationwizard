import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { FahrzeugDetail } from './fahrzeug-detail';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { erzeugeTestfahrzeug } from '../../testing/fahrzeug-testdaten';

function route(id: string): ActivatedRoute {
  const paramMap = convertToParamMap({ id });
  return { paramMap: of(paramMap), snapshot: { paramMap } } as unknown as ActivatedRoute;
}

/** Instanziiert die Komponente und lässt den Lade-Effekt im Konstruktor einmal laufen. */
function erzeugeDetail(): FahrzeugDetail {
  const detail = TestBed.runInInjectionContext(() => new FahrzeugDetail());
  TestBed.tick();
  return detail;
}

describe('FahrzeugDetail', () => {
  it('beginnt bei der Route "neu" ein neues Fahrzeug', () => {
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => null,
      speichertGerade: () => false,
      istNeu: () => true,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: FahrzeugStoreService, useValue: store },
        { provide: ActivatedRoute, useValue: route('neu') },
      ],
    });
    erzeugeDetail();
    expect(store.neuesFahrzeugBeginnen).toHaveBeenCalledOnce();
    expect(store.fahrzeugLaden).not.toHaveBeenCalled();
  });

  it('lädt ein bestehendes Fahrzeug anhand der Routen-id', () => {
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => null,
      speichertGerade: () => false,
      istNeu: () => false,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: FahrzeugStoreService, useValue: store },
        { provide: ActivatedRoute, useValue: route('bestehende-id') },
      ],
    });
    erzeugeDetail();
    expect(store.fahrzeugLaden).toHaveBeenCalledWith('bestehende-id');
    expect(store.neuesFahrzeugBeginnen).not.toHaveBeenCalled();
  });

  it('erkennt eine bereits offene Hauptuntersuchung und lässt weitere Termine zu', () => {
    const fahrzeug = erzeugeTestfahrzeug({
      wartungstermine: [
        {
          id: 'hu-1',
          art: 'hu',
          bezeichnung: 'Hauptuntersuchung',
          faelligAm: '2026-12-01',
          erinnerungTage: 30,
          erledigtAm: null,
        },
      ],
    });
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
      wartungstermineAktualisieren: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: FahrzeugStoreService, useValue: store },
        { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
      ],
    });
    const detail = erzeugeDetail();
    expect(detail.hatOffeneHu()).toBe(true);

    detail.wartungHinzufuegen('frei');
    expect(store.wartungstermineAktualisieren).toHaveBeenCalledWith([
      fahrzeug.wartungstermine[0],
      expect.objectContaining({ art: 'frei', bezeichnung: '' }),
    ]);
  });

  it('navigiert nach erfolgreichem Speichern eines neuen Fahrzeugs zur Detailseite', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => true,
      speichern: vi.fn().mockResolvedValue(true),
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: FahrzeugStoreService, useValue: store },
        { provide: ActivatedRoute, useValue: route('neu') },
        { provide: Router, useValue: router },
      ],
    });
    const detail = erzeugeDetail();
    await detail.speichern();
    expect(router.navigate).toHaveBeenCalledWith(['/fahrzeuge', fahrzeug.id], { replaceUrl: true });
  });

  it('navigiert nicht, wenn ein bestehendes Fahrzeug gespeichert wird', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
      speichern: vi.fn().mockResolvedValue(true),
    };
    const router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: FahrzeugStoreService, useValue: store },
        { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
        { provide: Router, useValue: router },
      ],
    });
    const detail = erzeugeDetail();
    await detail.speichern();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('lädt nach bestätigtem Konflikt den aktuellen Stand neu, sonst nicht', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const store = {
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeugLaden: vi.fn(),
      entwurf: () => fahrzeug,
      speichertGerade: () => false,
      istNeu: () => false,
      neuLadenNachKonflikt: vi.fn(),
    };
    const dialog = { bestaetigen: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: FahrzeugStoreService, useValue: store },
        { provide: ActivatedRoute, useValue: route(fahrzeug.id) },
        { provide: DialogDienst, useValue: dialog },
      ],
    });
    const detail = erzeugeDetail();

    dialog.bestaetigen.mockResolvedValue(false);
    await detail.nachKonfliktNeuLaden();
    expect(store.neuLadenNachKonflikt).not.toHaveBeenCalled();

    dialog.bestaetigen.mockResolvedValue(true);
    await detail.nachKonfliktNeuLaden();
    expect(store.neuLadenNachKonflikt).toHaveBeenCalledWith(fahrzeug.id);
  });
});
