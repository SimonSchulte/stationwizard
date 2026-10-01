import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { FahrzeugDashboard } from './fahrzeug-dashboard';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { erzeugeTestfahrzeug } from '../../testing/fahrzeug-testdaten';

function konfiguriere(fahrzeuge: ReturnType<typeof erzeugeTestfahrzeug>[], extra: unknown[] = []) {
  const store = {
    fahrzeuge: () => fahrzeuge,
    listeLaedt: () => false,
    listeFehler: () => '',
    listeLaden: vi.fn().mockResolvedValue(undefined),
    neuesFahrzeugBeginnen: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: FahrzeugStoreService, useValue: store }, ...extra],
  });
  return { store };
}

async function erzeugeUndWarte(): Promise<FahrzeugDashboard> {
  const dashboard = TestBed.runInInjectionContext(() => new FahrzeugDashboard());
  dashboard.ngOnInit();
  await Promise.resolve();
  return dashboard;
}

describe('FahrzeugDashboard', () => {
  it('lädt die Fahrzeugliste mit genau einem Aufruf', async () => {
    const { store } = konfiguriere([erzeugeTestfahrzeug()]);
    await erzeugeUndWarte();
    expect(store.listeLaden).toHaveBeenCalledOnce();
  });

  it('beginnt ein neues Fahrzeug und navigiert zur Anlage', async () => {
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    const { store } = konfiguriere([], [{ provide: Router, useValue: router }]);
    const dashboard = await erzeugeUndWarte();
    dashboard.neuesFahrzeug();
    expect(store.neuesFahrzeugBeginnen).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/fahrzeuge/neu']);
  });
});
