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
});
