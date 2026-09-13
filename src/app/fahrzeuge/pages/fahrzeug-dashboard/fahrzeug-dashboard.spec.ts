import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { FahrzeugDashboard } from './fahrzeug-dashboard';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { ApiFahrzeugStorage } from '../../storage/api-fahrzeug-storage';
import {
  erzeugeTestablesung,
  erzeugeTestfahrzeug,
  erzeugeTestwartung,
} from '../../testing/fahrzeug-testdaten';

function konfiguriere(
  fahrzeuge: ReturnType<typeof erzeugeTestfahrzeug>[],
  storageMock: Record<string, unknown> = {},
  extra: unknown[] = [],
) {
  const store = {
    fahrzeuge: () => fahrzeuge,
    listeLaedt: () => false,
    listeFehler: () => '',
    listeLaden: vi.fn().mockResolvedValue(undefined),
    neuesFahrzeugBeginnen: vi.fn(),
  };
  const storage = { ladeAblesungen: vi.fn().mockResolvedValue([]), ...storageMock };
  TestBed.configureTestingModule({
    providers: [
      { provide: FahrzeugStoreService, useValue: store },
      { provide: ApiFahrzeugStorage, useValue: storage },
      ...extra,
    ],
  });
  return { store, storage };
}

async function erzeugeUndWarte(): Promise<FahrzeugDashboard> {
  const dashboard = TestBed.runInInjectionContext(() => new FahrzeugDashboard());
  dashboard.ngOnInit();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return dashboard;
}

describe('FahrzeugDashboard', () => {
  it('lädt die Fahrzeugliste und anschließend die Kilometerbilanzen', async () => {
    const fahrzeug = erzeugeTestfahrzeug();
    const { store, storage } = konfiguriere([fahrzeug]);
    await erzeugeUndWarte();
    expect(store.listeLaden).toHaveBeenCalledOnce();
    expect(storage.ladeAblesungen).toHaveBeenCalledWith(fahrzeug.id);
  });

  it('listet offene Wartungen über alle Fahrzeuge, sortiert nach Fälligkeit, ohne erledigte', async () => {
    const bald = erzeugeTestfahrzeug({
      id: 'f1',
      bezeichnung: 'Bald fällig',
      wartungstermine: [erzeugeTestwartung({ faelligAm: '2026-01-10', erinnerungTage: 30 })],
    });
    const spaeter = erzeugeTestfahrzeug({
      id: 'f2',
      bezeichnung: 'Später fällig',
      wartungstermine: [
        erzeugeTestwartung({ faelligAm: '2026-06-01', erinnerungTage: 30 }),
        erzeugeTestwartung({ faelligAm: '2026-01-01', erledigtAm: '2026-01-01' }),
      ],
    });
    konfiguriere([spaeter, bald]);
    const dashboard = await erzeugeUndWarte();
    const bezeichnungen = dashboard.offeneWartungen().map((e) => e.fahrzeug.bezeichnung);
    expect(bezeichnungen).toEqual(['Bald fällig', 'Später fällig']);
  });

  it('berechnet die Kilometerbilanz je Fahrzeug und sortiert alphabetisch', async () => {
    const b = erzeugeTestfahrzeug({ id: 'f-b', bezeichnung: 'B-Fahrzeug', eigentuemer: 'bund' });
    const a = erzeugeTestfahrzeug({
      id: 'f-a',
      bezeichnung: 'A-Fahrzeug',
      eigentuemer: 'organisation',
    });
    konfiguriere([b, a], {
      ladeAblesungen: vi.fn((id: string) =>
        Promise.resolve(
          id === 'f-b' ? [erzeugeTestablesung({ fahrzeugId: 'f-b', stand: 100 })] : [],
        ),
      ),
    });
    const dashboard = await erzeugeUndWarte();
    expect(dashboard.bilanzen().map((e) => e.fahrzeug.bezeichnung)).toEqual([
      'A-Fahrzeug',
      'B-Fahrzeug',
    ]);
    expect(dashboard.bilanzen()[1].bilanz.sollKm).toBe(600);
  });

  it('merkt sich das Datum der letzten Ablesung je Fahrzeug für den Lücken-Hinweis', async () => {
    const mitAblesung = erzeugeTestfahrzeug({ id: 'mit', bezeichnung: 'Mit Ablesung' });
    const ohneAblesung = erzeugeTestfahrzeug({ id: 'ohne', bezeichnung: 'Ohne Ablesung' });
    konfiguriere([mitAblesung, ohneAblesung], {
      ladeAblesungen: vi.fn((id: string) =>
        Promise.resolve(
          id === 'mit'
            ? [erzeugeTestablesung({ fahrzeugId: 'mit', abgelesenAm: '2025-01-01' })]
            : [],
        ),
      ),
    });
    const dashboard = await erzeugeUndWarte();
    const [mit, ohne] = dashboard.bilanzen();
    expect(mit.letzteAblesungAm).toBe('2025-01-01');
    expect(mit.hatAbleseLuecke).toBe(true);
    expect(ohne.letzteAblesungAm).toBeNull();
    expect(ohne.hatAbleseLuecke).toBe(true);
  });

  it('zeigt die Bilanzen erfolgreicher Fahrzeuge, auch wenn eines fehlschlägt', async () => {
    const ok = erzeugeTestfahrzeug({ id: 'ok', bezeichnung: 'OK' });
    const kaputt = erzeugeTestfahrzeug({ id: 'kaputt', bezeichnung: 'Kaputt' });
    konfiguriere([ok, kaputt], {
      ladeAblesungen: vi.fn((id: string) =>
        id === 'kaputt' ? Promise.reject(new Error('Netzwerkfehler')) : Promise.resolve([]),
      ),
    });
    const dashboard = await erzeugeUndWarte();
    expect(dashboard.bilanzen().map((e) => e.fahrzeug.id)).toEqual(['ok']);
    expect(dashboard.bilanzenFehler()).toContain('nicht geladen werden');
  });

  it('kürzt die Übersicht auf die dringendsten Termine', async () => {
    const viele = Array.from({ length: 7 }, (_, i) =>
      erzeugeTestwartung({ faelligAm: `2026-01-${String(i + 1).padStart(2, '0')}` }),
    );
    const fahrzeug = erzeugeTestfahrzeug({ wartungstermine: viele });
    konfiguriere([fahrzeug]);
    const dashboard = await erzeugeUndWarte();
    expect(dashboard.offeneWartungen()).toHaveLength(7);
    expect(dashboard.naechsteWartungenKompakt()).toHaveLength(5);
  });

  it('springt beim "Alle anzeigen" auf den Wartungen-Tab', async () => {
    konfiguriere([]);
    const dashboard = await erzeugeUndWarte();
    expect(dashboard.ausgewaehlterTab()).toBe(0);
    dashboard.alleWartungenAnzeigen();
    expect(dashboard.ausgewaehlterTab()).toBe(2);
  });

  it('beginnt ein neues Fahrzeug und navigiert zur Anlage', async () => {
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    const { store } = konfiguriere([], {}, [{ provide: Router, useValue: router }]);
    const dashboard = await erzeugeUndWarte();
    dashboard.neuesFahrzeug();
    expect(store.neuesFahrzeugBeginnen).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/fahrzeuge/neu']);
  });
});
