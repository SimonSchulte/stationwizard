import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { ArtikelTabelle } from '../../components/artikel-tabelle/artikel-tabelle';
import { KisteEditor } from '../../components/kiste-editor/kiste-editor';
import { KisteListe } from '../../components/kiste-liste/kiste-liste';
import { LagerListe } from '../../components/lager-liste/lager-liste';
import { KistenDruckDienst } from '../../services/kisten-druck';
import { StammdatenStoreService } from '../../services/stammdaten-store.service';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { ApiStammdatenStorage } from '../../storage/api-stammdaten-storage';
import { InMemoryStammdatenStorage } from '../../testing/in-memory-stammdaten-storage';
import {
  erzeugeTestArtikel,
  erzeugeTestKiste,
  erzeugeTestLager,
} from '../../testing/stammdaten-testdaten';
import { Stammdaten } from './stammdaten';

async function erzeuge(bestaetigen = true) {
  const storage = new InMemoryStammdatenStorage();
  const kalt = erzeugeTestLager({ name: 'Kaltlager', reihenfolge: 1 });
  storage._vorbelegen([kalt], [erzeugeTestArtikel({ name: 'Besen', lagerId: kalt.id })]);
  const dialog = { bestaetigen: vi.fn().mockResolvedValue(bestaetigen) };
  const druck = {
    schildDrucken: vi.fn().mockResolvedValue(undefined),
    zettelDrucken: vi.fn().mockResolvedValue(undefined),
  };
  const meldungen = { fehler: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: KistenDruckDienst, useValue: druck },
      { provide: MeldungsDienst, useValue: meldungen },
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
    druck,
    meldungen,
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
    expect(reiter).toEqual(['Lager (1)', 'Artikel (1)', 'Kisten (0)']);
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

  describe('Kisten', () => {
    async function kistenSeite(bestaetigen = true) {
      const seite = await erzeuge(bestaetigen);
      seite.storage._vorbelegen(
        [],
        [],
        [
          erzeugeTestKiste({ id: 'k1', name: 'Eins' }),
          erzeugeTestKiste({ id: 'k2', name: 'Zwei' }),
        ],
      );
      await seite.store.laden();
      seite.fixture.detectChanges();
      const tabs = seite.fixture.debugElement.queryAll(By.css('[role="tab"]'));
      (tabs[2].nativeElement as HTMLElement).click();
      seite.fixture.detectChanges();
      await seite.fixture.whenStable();
      seite.fixture.detectChanges();
      return seite;
    }

    it('zeigt ohne Wahl einen Hinweis und nach der Wahl den Editor', async () => {
      const { fixture } = await kistenSeite();
      expect(fixture.debugElement.query(By.directive(KisteEditor))).toBeNull();
      fixture.debugElement.query(By.directive(KisteListe)).componentInstance.gewaehlt.emit('k1');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(KisteEditor))).not.toBeNull();
    });

    it('legt eine Kiste an und wählt sie', async () => {
      const { fixture, store } = await kistenSeite();
      fixture.debugElement.query(By.directive(KisteListe)).componentInstance.angelegt.emit('Drei');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(store.kisten().map((k) => k.name)).toEqual(['Drei', 'Eins', 'Zwei']);
      const editor = fixture.debugElement.query(By.directive(KisteEditor));
      expect(editor.componentInstance.kiste().name).toBe('Drei');
    });

    it('speichert über den Editor und merkt ungespeicherte Änderungen', async () => {
      const { fixture, store } = await kistenSeite();
      fixture.debugElement.query(By.directive(KisteListe)).componentInstance.gewaehlt.emit('k1');
      await fixture.whenStable();
      fixture.detectChanges();
      const editor = fixture.debugElement.query(By.directive(KisteEditor));
      const seite = fixture.componentInstance as unknown as { hatUngespeichertes(): boolean };
      editor.componentInstance.ungespeichert.emit(true);
      expect(seite.hatUngespeichertes()).toBe(true);
      editor.componentInstance.gespeichert.emit({ name: 'Eins neu', lagerId: null, inhalt: [] });
      await fixture.whenStable();
      expect(store.kisten().map((k) => k.name)).toEqual(['Eins neu', 'Zwei']);
    });

    it('fragt beim Wechsel mit ungespeicherten Änderungen nach und wechselt nur bei Bestätigung', async () => {
      const abgelehnt = await kistenSeite(false);
      const liste = () => abgelehnt.fixture.debugElement.query(By.directive(KisteListe));
      liste().componentInstance.gewaehlt.emit('k1');
      await abgelehnt.fixture.whenStable();
      abgelehnt.fixture.detectChanges();
      abgelehnt.fixture.debugElement
        .query(By.directive(KisteEditor))
        .componentInstance.ungespeichert.emit(true);
      liste().componentInstance.gewaehlt.emit('k2');
      await abgelehnt.fixture.whenStable();
      abgelehnt.fixture.detectChanges();
      expect(abgelehnt.dialog.bestaetigen).toHaveBeenCalled();
      expect(
        abgelehnt.fixture.debugElement.query(By.directive(KisteEditor)).componentInstance.kiste()
          .id,
      ).toBe('k1');
    });

    it('wechselt mit Bestätigung und löscht eine Kiste nach Rückfrage', async () => {
      const { fixture, store } = await kistenSeite(true);
      const liste = () => fixture.debugElement.query(By.directive(KisteListe));
      liste().componentInstance.gewaehlt.emit('k1');
      await fixture.whenStable();
      fixture.detectChanges();
      fixture.debugElement
        .query(By.directive(KisteEditor))
        .componentInstance.ungespeichert.emit(true);
      liste().componentInstance.gewaehlt.emit('k2');
      await fixture.whenStable();
      fixture.detectChanges();
      const editor = fixture.debugElement.query(By.directive(KisteEditor));
      expect(editor.componentInstance.kiste().id).toBe('k2');
      editor.componentInstance.geloescht.emit();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(store.kisten().map((k) => k.id)).toEqual(['k1']);
      expect(fixture.debugElement.query(By.directive(KisteEditor))).toBeNull();
    });

    it('druckt Schild und Zettel der gewählten Kiste mit Artikel- und Lagerdaten', async () => {
      const { fixture, druck } = await kistenSeite();
      fixture.debugElement.query(By.directive(KisteListe)).componentInstance.gewaehlt.emit('k1');
      await fixture.whenStable();
      fixture.detectChanges();
      const editor = fixture.debugElement.query(By.directive(KisteEditor)).componentInstance;
      editor.schildDrucken.emit();
      editor.zettelDrucken.emit();
      await fixture.whenStable();
      expect(druck.schildDrucken).toHaveBeenCalledOnce();
      const [kisten, daten] = druck.schildDrucken.mock.calls[0];
      expect(kisten.map((k: { id: string }) => k.id)).toEqual(['k1']);
      expect(daten.artikel).toBeInstanceOf(Map);
      expect(daten.lager).toBeInstanceOf(Map);
      expect(druck.zettelDrucken).toHaveBeenCalledOnce();
    });

    it('meldet einen fehlgeschlagenen Druck', async () => {
      const { fixture, druck, meldungen } = await kistenSeite();
      druck.schildDrucken.mockRejectedValue(new Error('x'));
      fixture.debugElement.query(By.directive(KisteListe)).componentInstance.gewaehlt.emit('k1');
      await fixture.whenStable();
      fixture.detectChanges();
      fixture.debugElement.query(By.directive(KisteEditor)).componentInstance.schildDrucken.emit();
      await fixture.whenStable();
      expect(meldungen.fehler).toHaveBeenCalledWith('Der Druck konnte nicht erstellt werden.');
    });
  });
});
