import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Preiskatalog } from './preiskatalog';
import { PreiskatalogStoreService } from '../../services/preiskatalog-store.service';
import { erzeugeTestPreiskatalogEintrag } from '../../testing/preiskatalog-testdaten';

function erzeuge(
  store: Record<string, unknown>,
  dialogDienst: Record<string, unknown> = {},
): Preiskatalog {
  TestBed.configureTestingModule({
    providers: [
      { provide: PreiskatalogStoreService, useValue: store },
      {
        provide: DialogDienst,
        useValue: { bestaetigen: vi.fn().mockResolvedValue(true), ...dialogDienst },
      },
    ],
  });
  return TestBed.runInInjectionContext(() => new Preiskatalog());
}

describe('Preiskatalog', () => {
  it('lädt den Katalog beim Start', () => {
    const store = { laden: vi.fn(), eintraege: () => [] };
    const seite = erzeuge(store);
    seite.ngOnInit();
    expect(store.laden).toHaveBeenCalledOnce();
  });

  it('legt einen neuen Eintrag mit Standardwerten an', async () => {
    const store = {
      laden: vi.fn(),
      eintragSpeichern: vi.fn().mockResolvedValue(true),
      eintraege: () => [],
    };
    const seite = erzeuge(store);
    await seite.neuerEintrag();
    expect(store.eintragSpeichern).toHaveBeenCalledWith(
      expect.objectContaining({
        bezeichnung: 'Neuer Eintrag',
        art: 'einsatzkraft',
        einzelpreisCent: 0,
      }),
      null,
    );
  });

  it('speichert eine geänderte Bezeichnung mit der aktuellen Version', async () => {
    const eintrag = erzeugeTestPreiskatalogEintrag({ version: 2 });
    const store = {
      laden: vi.fn(),
      eintragSpeichern: vi.fn().mockResolvedValue(true),
      eintraege: () => [],
    };
    const seite = erzeuge(store);
    await seite.bezeichnungAktualisieren(eintrag, 'Neuer Name');
    expect(store.eintragSpeichern).toHaveBeenCalledWith(
      expect.objectContaining({ id: eintrag.id, bezeichnung: 'Neuer Name' }),
      2,
    );
  });

  it('speichert nicht, wenn sich die Bezeichnung nicht geändert hat', async () => {
    const eintrag = erzeugeTestPreiskatalogEintrag({ bezeichnung: 'Gleich' });
    const store = { laden: vi.fn(), eintragSpeichern: vi.fn(), eintraege: () => [] };
    const seite = erzeuge(store);
    await seite.bezeichnungAktualisieren(eintrag, 'Gleich');
    expect(store.eintragSpeichern).not.toHaveBeenCalled();
  });

  it('löscht einen Eintrag erst nach Bestätigung', async () => {
    const eintrag = erzeugeTestPreiskatalogEintrag();
    const store = {
      laden: vi.fn(),
      eintragLoeschen: vi.fn().mockResolvedValue(true),
      eintraege: () => [],
    };
    const dialogDienst = { bestaetigen: vi.fn().mockResolvedValue(false) };
    const seite = erzeuge(store, dialogDienst);
    await seite.eintragLoeschen(eintrag);
    expect(store.eintragLoeschen).not.toHaveBeenCalled();
  });
});
