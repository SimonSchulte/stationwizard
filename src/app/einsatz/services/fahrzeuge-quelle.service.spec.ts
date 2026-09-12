import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { FahrzeugStoreService } from '../../fahrzeuge/services/fahrzeug-store.service';
import { erzeugeTestfahrzeug } from '../../fahrzeuge/testing/fahrzeug-testdaten';
import { FahrzeugeQuelleService } from './fahrzeuge-quelle.service';

describe('FahrzeugeQuelleService', () => {
  it('übersetzt Fahrzeugstamm in das unveränderte Einsatz-Fahrzeugmodell', () => {
    const fahrzeug = erzeugeTestfahrzeug({
      funkrufname: 'Florian Test 1/85/1',
      fahrgestellnummer: 'WBA1234567890123A',
    });
    const store = { fahrzeuge: () => [fahrzeug], listeLaden: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: FahrzeugStoreService, useValue: store }],
    });
    const quelle = TestBed.inject(FahrzeugeQuelleService);
    expect(quelle.fahrzeuge()).toEqual([
      { seriennummer: 'WBA1234567890123A', funkruf: 'Florian Test 1/85/1', hiorgId: '' },
    ]);
  });

  it('bildet eine fehlende Fahrgestellnummer auf eine leere Seriennummer ab', () => {
    const fahrzeug = erzeugeTestfahrzeug({ fahrgestellnummer: null });
    const store = { fahrzeuge: () => [fahrzeug], listeLaden: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: FahrzeugStoreService, useValue: store }],
    });
    const quelle = TestBed.inject(FahrzeugeQuelleService);
    expect(quelle.fahrzeuge()[0].seriennummer).toBe('');
  });

  it('lädt beim ersten Aufruf und danach nicht erneut', () => {
    const store = { fahrzeuge: () => [], listeLaden: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: FahrzeugStoreService, useValue: store }],
    });
    const quelle = TestBed.inject(FahrzeugeQuelleService);
    quelle.sicherstellenGeladen();
    quelle.sicherstellenGeladen();
    quelle.sicherstellenGeladen();
    expect(store.listeLaden).toHaveBeenCalledOnce();
  });
});
