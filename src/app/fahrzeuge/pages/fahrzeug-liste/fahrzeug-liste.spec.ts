import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { FahrzeugListe } from './fahrzeug-liste';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { erzeugeTestfahrzeug } from '../../testing/fahrzeug-testdaten';

describe('FahrzeugListe', () => {
  it('lädt die Liste beim Start', () => {
    const store = {
      listeLaden: vi.fn(),
      fahrzeuge: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: FahrzeugStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new FahrzeugListe());
    liste.ngOnInit();
    expect(store.listeLaden).toHaveBeenCalledOnce();
  });

  it('filtert nach Suchtext über Bezeichnung, Funkrufname und Kennzeichen', () => {
    const treffer = erzeugeTestfahrzeug({
      bezeichnung: 'MTW Nord',
      funkrufname: '',
      kennzeichen: 'AA-1',
    });
    const kandidat2 = erzeugeTestfahrzeug({
      bezeichnung: 'RTW Süd',
      funkrufname: 'Nord 1',
      kennzeichen: 'BB-2',
    });
    const kandidat3 = erzeugeTestfahrzeug({
      bezeichnung: 'ELW',
      funkrufname: '',
      kennzeichen: 'CC-3',
    });
    const store = {
      listeLaden: vi.fn(),
      fahrzeuge: () => [treffer, kandidat2, kandidat3],
      listeLaedt: () => false,
      listeFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: FahrzeugStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new FahrzeugListe());
    liste.suche.set('nord');
    expect(liste.gefiltert()).toEqual([treffer, kandidat2]);
  });

  it('filtert nach Eigentümer', () => {
    const land = erzeugeTestfahrzeug({ eigentuemer: 'land-nrw' });
    const bund = erzeugeTestfahrzeug({ eigentuemer: 'bund' });
    const store = {
      listeLaden: vi.fn(),
      fahrzeuge: () => [land, bund],
      listeLaedt: () => false,
      listeFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: FahrzeugStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new FahrzeugListe());
    liste.eigentuemerFilter.set('bund');
    expect(liste.gefiltert()).toEqual([bund]);
  });

  it('beginnt ein neues Fahrzeug und navigiert zur Anlage', async () => {
    const store = {
      listeLaden: vi.fn(),
      neuesFahrzeugBeginnen: vi.fn(),
      fahrzeuge: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: FahrzeugStoreService, useValue: store },
        { provide: Router, useValue: router },
      ],
    });
    const liste = TestBed.runInInjectionContext(() => new FahrzeugListe());
    liste.neuesFahrzeug();
    expect(store.neuesFahrzeugBeginnen).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/fahrzeuge/neu']);
  });
});
