import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from './dialog/dialog-dienst';
import { verlassenGuard } from './verlassen-guard';

describe('verlassenGuard', () => {
  function aufbauen(bestaetigt = true) {
    const bestaetigen = vi.fn().mockResolvedValue(bestaetigt);
    TestBed.configureTestingModule({
      providers: [{ provide: DialogDienst, useValue: { bestaetigen } }],
    });
    return bestaetigen;
  }
  const lauf = (guard: ReturnType<typeof verlassenGuard>, seite: unknown) =>
    TestBed.runInInjectionContext(() => guard(seite, null as never, null as never, null as never));

  it('lässt eine Seite ohne Änderungen ohne Rückfrage gehen', () => {
    const bestaetigen = aufbauen();
    expect(
      lauf(
        verlassenGuard(() => false),
        {},
      ),
    ).toBe(true);
    expect(bestaetigen).not.toHaveBeenCalled();
  });

  it('fragt bei Ungespeichertem nach und folgt der Antwort', async () => {
    const bestaetigen = aufbauen(false);
    expect(
      await lauf(
        verlassenGuard(() => true),
        {},
      ),
    ).toBe(false);
    expect(bestaetigen).toHaveBeenCalledWith(
      expect.stringContaining('nicht gespeichert'),
      'Ungespeicherte Änderungen',
      'Verwerfen und verlassen',
    );
  });

  it('gibt die Seitenkomponente an die Prüfung weiter', () => {
    aufbauen();
    const pruefung = vi.fn().mockReturnValue(false);
    const seite = { geaendert: false };
    lauf(verlassenGuard(pruefung), seite);
    expect(pruefung).toHaveBeenCalledWith(seite);
  });
});
