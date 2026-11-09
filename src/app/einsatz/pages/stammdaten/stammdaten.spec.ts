import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { ArtikelTabelle } from '../../components/artikel-tabelle/artikel-tabelle';
import { LagerListe } from '../../components/lager-liste/lager-liste';
import { StammdatenStoreService } from '../../services/stammdaten-store.service';
import { ApiStammdatenStorage } from '../../storage/api-stammdaten-storage';
import { InMemoryStammdatenStorage } from '../../testing/in-memory-stammdaten-storage';
import { erzeugeTestArtikel, erzeugeTestLager } from '../../testing/stammdaten-testdaten';
import { Stammdaten } from './stammdaten';

async function erzeuge(bestaetigen = true) {
  const storage = new InMemoryStammdatenStorage();
  const kalt = erzeugeTestLager({ name: 'Kaltlager', reihenfolge: 1 });
  storage._vorbelegen([kalt], [erzeugeTestArtikel({ name: 'Besen', lagerId: kalt.id })]);
  const dialog = { bestaetigen: vi.fn().mockResolvedValue(bestaetigen) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiStammdatenStorage, useValue: storage },
      { provide: DialogDienst, useValue: dialog },
    ],
  });
  const fixture = TestBed.createComponent(Stammdaten);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  // Die Reiterköpfe von Material aktualisieren sich erst im Folgezyklus.
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    storage,
    dialog,
    store: TestBed.inject(StammdatenStoreService),
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('Stammdaten', () => {
  it('lädt beim Öffnen beide Listen und nennt die Zahlen in den Reitern', async () => {
    const { element, store } = await erzeuge();
    expect(store.lager()).toHaveLength(1);
    expect(store.artikel()).toHaveLength(1);
    const reiter = [...element.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
    expect(reiter).toEqual(['Lager (1)', 'Artikel (1)']);
  });

  it('legt ein Lager über die Liste an', async () => {
    const { fixture, store } = await erzeuge();
    fixture.debugElement
      .query(By.directive(LagerListe))
      .componentInstance.angelegt.emit('Kfz-Halle');
    await fixture.whenStable();
    expect(store.lager().map((l) => l.name)).toEqual(['Kaltlager', 'Kfz-Halle']);
  });

  it('fragt vor dem Löschen eines Lagers nach und löscht nur bei Bestätigung', async () => {
    const abgelehnt = await erzeuge(false);
    await abgelehnt.store.lagerAnlegen('Leer');
    const leer = abgelehnt.store.lager()[1];
    abgelehnt.fixture.debugElement
      .query(By.directive(LagerListe))
      .componentInstance.geloescht.emit(leer);
    await abgelehnt.fixture.whenStable();
    expect(abgelehnt.dialog.bestaetigen).toHaveBeenCalled();
    expect(abgelehnt.store.lager()).toHaveLength(2);
  });

  it('löscht mit Bestätigung und zeigt Fehler des Stores an', async () => {
    const { fixture, store, element } = await erzeuge(true);
    await store.lagerAnlegen('Leer');
    fixture.debugElement
      .query(By.directive(LagerListe))
      .componentInstance.geloescht.emit(store.lager()[1]);
    await fixture.whenStable();
    expect(store.lager()).toHaveLength(1);
    await store.lagerAnlegen('kaltlager');
    fixture.detectChanges();
    expect(element.querySelector('app-meldung')?.textContent ?? '').toContain('gibt es schon');
  });

  it('leitet Artikeländerungen und das Löschen an den Store', async () => {
    const { fixture, store } = await erzeuge(true);
    // Der Artikel-Reiter ist erst nach dem Öffnen gerendert.
    const tabs = fixture.debugElement.queryAll(By.css('[role="tab"]'));
    (tabs[1].nativeElement as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const tabelle = fixture.debugElement.query(By.directive(ArtikelTabelle));
    tabelle.componentInstance.angelegt.emit({ name: 'Pavillon', einheit: 'Stück', lagerId: null });
    await fixture.whenStable();
    expect(store.artikel().map((a) => a.name)).toEqual(['Besen', 'Pavillon']);
    tabelle.componentInstance.geaendert.emit({
      artikel: store.artikel()[0],
      aenderung: { einheit: 'Satz' },
    });
    await fixture.whenStable();
    expect(store.artikel()[0].einheit).toBe('Satz');
    tabelle.componentInstance.geloescht.emit(store.artikel()[1]);
    await fixture.whenStable();
    expect(store.artikel().map((a) => a.name)).toEqual(['Besen']);
  });
});
