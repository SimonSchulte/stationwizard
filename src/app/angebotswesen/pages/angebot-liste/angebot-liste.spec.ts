import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AngebotListe } from './angebot-liste';
import { AngebotStoreService } from '../../services/angebot-store.service';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../../testing/angebot-testdaten';

describe('AngebotListe', () => {
  it('lädt die Liste beim Start', () => {
    const store = {
      listeLaden: vi.fn(),
      angebote: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AngebotStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new AngebotListe());
    liste.ngOnInit();
    expect(store.listeLaden).toHaveBeenCalledOnce();
  });

  it('berechnet die Gesamtsumme je Angebot und sortiert alphabetisch', () => {
    const b = erzeugeTestAngebot({
      bezeichnung: 'B-Angebot',
      schichten: [
        erzeugeTestSchicht({
          positionen: [erzeugeTestPosition({ einzelpreisCent: 1000, anzahl: 1, stunden: 1 })],
        }),
      ],
    });
    const a = erzeugeTestAngebot({
      bezeichnung: 'A-Angebot',
      schichten: [
        erzeugeTestSchicht({
          positionen: [erzeugeTestPosition({ einzelpreisCent: 500, anzahl: 1, stunden: 1 })],
        }),
      ],
    });
    const store = {
      listeLaden: vi.fn(),
      angebote: () => [b, a],
      listeLaedt: () => false,
      listeFehler: () => '',
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AngebotStoreService, useValue: store }],
    });
    const liste = TestBed.runInInjectionContext(() => new AngebotListe());
    expect(liste.zeilen().map((z) => z.angebot.bezeichnung)).toEqual(['A-Angebot', 'B-Angebot']);
    expect(liste.zeilen()[0].gesamtCent).toBe(500);
  });

  it('beginnt ein neues Angebot und navigiert zur Anlage', () => {
    const store = {
      listeLaden: vi.fn(),
      neuesAngebotBeginnen: vi.fn(),
      angebote: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AngebotStoreService, useValue: store },
        { provide: Router, useValue: router },
      ],
    });
    const liste = TestBed.runInInjectionContext(() => new AngebotListe());
    liste.neuesAngebot();
    expect(store.neuesAngebotBeginnen).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/angebotswesen/angebote/neu']);
  });
});
