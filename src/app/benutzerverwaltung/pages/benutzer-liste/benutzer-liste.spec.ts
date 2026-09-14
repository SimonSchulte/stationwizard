import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BenutzerListe } from './benutzer-liste';
import { Benutzerkonto } from '../../models/benutzerkonto.model';
import { BenutzerverwaltungStoreService } from '../../services/benutzerverwaltung-store.service';

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

describe('BenutzerListe', () => {
  it('lädt die Liste beim Start', () => {
    const store = {
      listeLaden: vi.fn(),
      benutzer: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
      speichertFuer: () => '',
      speicherFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: BenutzerverwaltungStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new BenutzerListe());
    liste.ngOnInit();
    expect(store.listeLaden).toHaveBeenCalledOnce();
  });

  it('reicht eine Übernahme unverändert an den Store weiter', () => {
    const store = {
      listeLaden: vi.fn(),
      rolleSetzen: vi.fn(),
      benutzer: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
      speichertFuer: () => '',
      speicherFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: BenutzerverwaltungStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new BenutzerListe());

    liste.uebernehmen('person@example.test', {
      rolle: 'helfer',
      sonderrollen: ['verwaltungshelfer'],
    });

    expect(store.rolleSetzen).toHaveBeenCalledWith('person@example.test', 'helfer', [
      'verwaltungshelfer',
    ]);
  });

  it('filtert nach E-Mail-Adresse', () => {
    const treffer = testkonto({ email: 'max.mustermann@juh-beispiel.de' });
    const kandidat = testkonto({ email: 'erika.beispiel@juh-beispiel.de' });
    const store = {
      listeLaden: vi.fn(),
      benutzer: () => [treffer, kandidat],
      listeLaedt: () => false,
      listeFehler: () => '',
      speichertFuer: () => '',
      speicherFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: BenutzerverwaltungStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new BenutzerListe());
    liste.suche.set('max.mustermann');
    expect(liste.gefiltert()).toEqual([treffer]);
  });

  it('filtert nach dem aus der E-Mail-Adresse abgeleiteten Namen', () => {
    const treffer = testkonto({ email: 'max.mustermann@juh-beispiel.de' });
    const kandidat = testkonto({ email: 'erika.beispiel@juh-beispiel.de' });
    const store = {
      listeLaden: vi.fn(),
      benutzer: () => [treffer, kandidat],
      listeLaedt: () => false,
      listeFehler: () => '',
      speichertFuer: () => '',
      speicherFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: BenutzerverwaltungStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new BenutzerListe());
    liste.suche.set('Mustermann');
    expect(liste.gefiltert()).toEqual([treffer]);
  });

  it('liefert ohne Suchtext die vollständige Liste', () => {
    const eintraege = [
      testkonto({ email: 'a@example.test' }),
      testkonto({ email: 'b@example.test' }),
    ];
    const store = {
      listeLaden: vi.fn(),
      benutzer: () => eintraege,
      listeLaedt: () => false,
      listeFehler: () => '',
      speichertFuer: () => '',
      speicherFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: BenutzerverwaltungStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new BenutzerListe());
    expect(liste.gefiltert()).toEqual(eintraege);
  });
});
