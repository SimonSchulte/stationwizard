import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from '@angular/router';
import { BehaelterUebersicht } from '../../models/behaelter.model';
import { BehaelterStoreService } from '../../services/behaelter-store.service';
import { erzeugeTestuebersicht } from '../../testing/material-testdaten';
import { MaterialDashboard } from './material-dashboard';

describe('MaterialDashboard', () => {
  const uebersicht = signal<BehaelterUebersicht[]>([]);
  const store = {
    listeLaedt: signal(false),
    listeFehler: signal(''),
    uebersicht,
    nachFahrzeug: signal<
      { fahrzeugId: string; bezeichnung: string; behaelter: BehaelterUebersicht[] }[]
    >([]),
    uebersichtLaden: vi.fn(),
    neuerBehaelter: vi.fn(),
  };

  function seite(): MaterialDashboard {
    TestBed.configureTestingModule({
      providers: [
        { provide: BehaelterStoreService, useValue: store },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    return TestBed.runInInjectionContext(() => new MaterialDashboard());
  }

  beforeEach(() => {
    vi.resetAllMocks();
    uebersicht.set([]);
    store.nachFahrzeug.set([]);
  });

  it('filtert nach Behälter- und Fahrzeugbezeichnung und verwirft leere Gruppen', () => {
    store.nachFahrzeug.set([
      {
        fahrzeugId: 'f1',
        bezeichnung: 'GW SAN Übung',
        behaelter: [
          erzeugeTestuebersicht({ id: 'b1', bezeichnung: 'NFR 1' }),
          erzeugeTestuebersicht({ id: 'b2', bezeichnung: 'Sauerstoffkoffer' }),
        ],
      },
      {
        fahrzeugId: 'f2',
        bezeichnung: 'KTW-B Übung',
        behaelter: [
          erzeugeTestuebersicht({
            id: 'b3',
            bezeichnung: 'NFR 9',
            fahrzeugBezeichnung: 'KTW-B Übung',
          }),
        ],
      },
    ]);
    const dashboard = seite();

    dashboard.suche.set('nfr');
    expect(dashboard.gruppen().map((g) => g.fahrzeugId)).toEqual(['f1', 'f2']);
    expect(dashboard.gruppen()[0]?.behaelter).toHaveLength(1);

    dashboard.suche.set('sauerstoff');
    expect(dashboard.gruppen()).toHaveLength(1);
    expect(dashboard.gruppen()[0]?.fahrzeugId).toBe('f1');
  });

  it('zählt die noch nie geprüften Behälter', () => {
    uebersicht.set([
      erzeugeTestuebersicht({ id: 'b1' }),
      erzeugeTestuebersicht({ id: 'b2', zuletztGeprueftAm: '2026-03-01' }),
    ]);
    expect(seite().nieGeprueft()).toBe(1);
  });

  it('nennt für einen nie geprüften Behälter keinen Befund, statt "ohne Beanstandung" zu behaupten', () => {
    const dashboard = seite();
    const eintrag = erzeugeTestuebersicht();
    expect(dashboard.befund(eintrag)).toBe('');
    expect(dashboard.istBeanstandet(eintrag)).toBe(false);
  });

  it('meldet einen geprüften Behälter ohne Abweichung als beanstandungsfrei', () => {
    const dashboard = seite();
    const eintrag = erzeugeTestuebersicht({
      zuletztGeprueftAm: '2026-03-01',
      letzteFehlmengen: 0,
      letzteUnbrauchbar: 0,
      letzteAbgelaufen: 0,
    });
    expect(dashboard.befund(eintrag)).toBe('ohne Beanstandung');
    expect(dashboard.istBeanstandet(eintrag)).toBe(false);
  });

  it('fasst die Abweichungen des letzten Checks zusammen', () => {
    const dashboard = seite();
    const eintrag = erzeugeTestuebersicht({
      zuletztGeprueftAm: '2026-03-01',
      letzteFehlmengen: 2,
      letzteUnbrauchbar: 0,
      letzteAbgelaufen: 3,
    });
    expect(dashboard.befund(eintrag)).toBe('2 Fehlmengen · 3 abgelaufen');
    expect(dashboard.istBeanstandet(eintrag)).toBe(true);
  });
});
