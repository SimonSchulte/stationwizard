import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { AngebotListe } from './angebot-liste';
import { AngebotStoreService } from '../../services/angebot-store.service';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../../testing/angebot-testdaten';

function erzeuge(
  store: Record<string, unknown>,
  weitereProvider: unknown[] = [],
  dialogDienst: Record<string, unknown> = {},
): AngebotListe {
  TestBed.configureTestingModule({
    providers: [
      { provide: AngebotStoreService, useValue: store },
      {
        provide: DialogDienst,
        useValue: { bestaetigen: vi.fn().mockResolvedValue(true), ...dialogDienst },
      },
      ...weitereProvider,
    ],
  });
  return TestBed.runInInjectionContext(() => new AngebotListe());
}

describe('AngebotListe', () => {
  it('lädt die Liste beim Start', () => {
    const store = {
      listeLaden: vi.fn(),
      angebote: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
      loeschtId: () => null,
    };
    const liste = erzeuge(store);
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
      loeschtId: () => null,
    };
    const liste = erzeuge(store);
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
      loeschtId: () => null,
    };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    const liste = erzeuge(store, [{ provide: Router, useValue: router }]);
    liste.neuesAngebot();
    expect(store.neuesAngebotBeginnen).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/angebotswesen/angebote/neu']);
  });

  it('löscht ein Angebot erst nach Bestätigung', async () => {
    const angebot = erzeugeTestAngebot({ bezeichnung: 'Zu löschen' });
    const store = {
      listeLaden: vi.fn(),
      angebotLoeschen: vi.fn().mockResolvedValue(true),
      angebote: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
      loeschtId: () => null,
    };
    const liste = erzeuge(store, [], { bestaetigen: vi.fn().mockResolvedValue(false) });
    await liste.angebotLoeschen(angebot);
    expect(store.angebotLoeschen).not.toHaveBeenCalled();
  });

  it('löscht ein Angebot nach bestätigtem Dialog', async () => {
    const angebot = erzeugeTestAngebot({ bezeichnung: 'Zu löschen' });
    const store = {
      listeLaden: vi.fn(),
      angebotLoeschen: vi.fn().mockResolvedValue(true),
      angebote: () => [],
      listeLaedt: () => false,
      listeFehler: () => '',
      loeschtId: () => null,
    };
    const liste = erzeuge(store, [], { bestaetigen: vi.fn().mockResolvedValue(true) });
    await liste.angebotLoeschen(angebot);
    expect(store.angebotLoeschen).toHaveBeenCalledWith(angebot.id);
  });
});
