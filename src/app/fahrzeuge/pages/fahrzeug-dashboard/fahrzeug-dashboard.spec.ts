import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { FahrzeugDashboard } from './fahrzeug-dashboard';
import { BerichtZeile, KmBericht } from '../../models/km-bericht.model';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';
import { erzeugeTestfahrzeug, erzeugeTestwartung } from '../../testing/fahrzeug-testdaten';

function berichtZeile(ueberschreibung: Partial<BerichtZeile> = {}): BerichtZeile {
  return {
    id: 'f-1',
    bezeichnung: 'MTW',
    funkrufname: 'Florian 1',
    kennzeichen: 'K-XY 123',
    eigentuemer: 'land-nrw',
    letzterStand: 12_000,
    abgelesenAm: '2026-06-01',
    tageSeitAblesung: 5,
    sollKm: 1800,
    istKm: 2000,
    restKm: 0,
    unvollstaendig: false,
    ...ueberschreibung,
  };
}

function konfiguriere(
  fahrzeuge: ReturnType<typeof erzeugeTestfahrzeug>[],
  bericht: KmBericht | null = {
    stichtag: '2026-06-15',
    jahr: 2026,
    zeilen: [],
    ohneAblesung: 0,
    unterSoll: 0,
  },
  extra: unknown[] = [],
) {
  const store = {
    fahrzeuge: () => fahrzeuge,
    listeLaedt: () => false,
    listeFehler: () => '',
    listeLaden: vi.fn().mockResolvedValue(undefined),
    neuesFahrzeugBeginnen: vi.fn(),
  };
  const berichtStore = {
    bericht: () => bericht,
    laedt: () => false,
    ladeFehler: () => '',
    berichtLaden: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: FahrzeugStoreService, useValue: store },
      { provide: KmBerichtStoreService, useValue: berichtStore },
      ...extra,
    ],
  });
  return { store, berichtStore };
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
  it('lädt Fahrzeugliste und Kilometerstandsbericht mit je einem Aufruf', async () => {
    const { store, berichtStore } = konfiguriere([erzeugeTestfahrzeug()]);
    await erzeugeUndWarte();
    expect(store.listeLaden).toHaveBeenCalledOnce();
    // Ein Aufruf für den gesamten Fuhrpark statt einer Abfrage je Fahrzeug.
    expect(berichtStore.berichtLaden).toHaveBeenCalledOnce();
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

  it('übernimmt die Kennzahlen des Berichts und sortiert alphabetisch', async () => {
    konfiguriere([erzeugeTestfahrzeug()], {
      stichtag: '2026-06-15',
      jahr: 2026,
      zeilen: [
        berichtZeile({ id: 'f-b', bezeichnung: 'B-Fahrzeug', eigentuemer: 'bund', sollKm: 600 }),
        berichtZeile({ id: 'f-a', bezeichnung: 'A-Fahrzeug', eigentuemer: 'organisation' }),
      ],
      ohneAblesung: 0,
      unterSoll: 0,
    });
    const dashboard = await erzeugeUndWarte();
    expect(dashboard.bilanzen().map((e) => e.bezeichnung)).toEqual(['A-Fahrzeug', 'B-Fahrzeug']);
    expect(dashboard.bilanzen()[1].bilanz.sollKm).toBe(600);
    expect(dashboard.bilanzen()[1].bilanz.jahr).toBe(2026);
    expect(dashboard.jahr()).toBe(2026);
  });

  it('leitet den Lücken-Hinweis aus den Tagen seit der letzten Ablesung ab', async () => {
    konfiguriere([erzeugeTestfahrzeug()], {
      stichtag: '2026-06-15',
      jahr: 2026,
      zeilen: [
        berichtZeile({ id: 'aktuell', bezeichnung: 'Aktuell', tageSeitAblesung: 5 }),
        berichtZeile({
          id: 'lange-her',
          bezeichnung: 'Lange her',
          abgelesenAm: '2026-01-02',
          tageSeitAblesung: 164,
        }),
        berichtZeile({
          id: 'ohne',
          bezeichnung: 'Ohne Ablesung',
          abgelesenAm: null,
          tageSeitAblesung: null,
          letzterStand: null,
        }),
      ],
      ohneAblesung: 1,
      unterSoll: 0,
    });
    const dashboard = await erzeugeUndWarte();
    const [aktuell, langeHer, ohne] = dashboard.bilanzen();
    expect(aktuell.hatAbleseLuecke).toBe(false);
    expect(langeHer.hatAbleseLuecke).toBe(true);
    expect(langeHer.letzteAblesungAm).toBe('2026-01-02');
    expect(ohne.hatAbleseLuecke).toBe(true);
    expect(ohne.letzteAblesungAm).toBeNull();
  });

  it('zeigt keine Bilanzen, solange kein Bericht vorliegt', async () => {
    konfiguriere([erzeugeTestfahrzeug()], null);
    const dashboard = await erzeugeUndWarte();
    expect(dashboard.bilanzen()).toEqual([]);
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
    const { store } = konfiguriere([], undefined, [{ provide: Router, useValue: router }]);
    const dashboard = await erzeugeUndWarte();
    dashboard.neuesFahrzeug();
    expect(store.neuesFahrzeugBeginnen).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/fahrzeuge/neu']);
  });
});
