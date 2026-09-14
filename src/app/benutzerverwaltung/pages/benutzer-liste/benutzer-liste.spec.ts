import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BenutzerListe } from './benutzer-liste';
import { BenutzerverwaltungStoreService } from '../../services/benutzerverwaltung-store.service';

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

  it('setzt die Hauptrolle über den Store, "" wird zu null', () => {
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

    liste.hauptrolleAendern('person@example.test', ['verwaltungshelfer'], 'helfer');
    expect(store.rolleSetzen).toHaveBeenCalledWith('person@example.test', 'helfer', [
      'verwaltungshelfer',
    ]);

    liste.hauptrolleAendern('person@example.test', [], '');
    expect(store.rolleSetzen).toHaveBeenCalledWith('person@example.test', null, []);
  });

  it('ergänzt oder entfernt eine Sonderrolle, ohne die Hauptrolle zu berühren', () => {
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

    liste.sonderrolleUmschalten(
      'person@example.test',
      'zugfuehrung',
      [],
      'verwaltungshelfer',
      true,
    );
    expect(store.rolleSetzen).toHaveBeenCalledWith('person@example.test', 'zugfuehrung', [
      'verwaltungshelfer',
    ]);

    liste.sonderrolleUmschalten(
      'person@example.test',
      'zugfuehrung',
      ['verwaltungshelfer'],
      'verwaltungshelfer',
      false,
    );
    expect(store.rolleSetzen).toHaveBeenCalledWith('person@example.test', 'zugfuehrung', []);
  });
});
