import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiStammdatenStorage } from '../storage/api-stammdaten-storage';
import { InMemoryStammdatenStorage } from '../testing/in-memory-stammdaten-storage';
import { erzeugeTestArtikel, erzeugeTestLager } from '../testing/stammdaten-testdaten';
import { StammdatenStoreService } from './stammdaten-store.service';

describe('StammdatenStoreService', () => {
  let storage: InMemoryStammdatenStorage;
  let store: StammdatenStoreService;

  beforeEach(() => {
    storage = new InMemoryStammdatenStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiStammdatenStorage, useValue: storage }],
    });
    store = TestBed.inject(StammdatenStoreService);
  });

  it('lädt Lager nach Reihenfolge und Artikel nach Name', async () => {
    storage._vorbelegen(
      [
        erzeugeTestLager({ id: 'l2', name: 'Kaltlager', reihenfolge: 2 }),
        erzeugeTestLager({ id: 'l1', name: 'Küchenlager', reihenfolge: 1 }),
      ],
      [
        erzeugeTestArtikel({ name: 'Zucker', lagerId: 'l1' }),
        erzeugeTestArtikel({ name: 'Besen', lagerId: 'l1' }),
        erzeugeTestArtikel({ name: 'Pavillon', lagerId: 'l2' }),
      ],
    );
    await store.laden();
    expect(store.lager().map((l) => l.name)).toEqual(['Küchenlager', 'Kaltlager']);
    expect(store.artikel().map((a) => a.name)).toEqual(['Besen', 'Pavillon', 'Zucker']);
    expect(store.artikelJeLager().get('l1')).toBe(2);
    expect(store.artikelJeLager().get('l2')).toBe(1);
    expect(store.laedt()).toBe(false);
  });

  it('meldet einen Ladefehler und lässt die Listen unverändert', async () => {
    storage.ladeLager = () => Promise.reject(new Error('Server nicht erreichbar'));
    await store.laden();
    expect(store.ladeFehler()).toBe('Server nicht erreichbar');
    expect(store.laedt()).toBe(false);
  });

  describe('Lager', () => {
    it('legt an und hängt das neue Lager ans Ende', async () => {
      expect(await store.lagerAnlegen('  Küchenlager ')).toBe(true);
      expect(await store.lagerAnlegen('Kaltlager')).toBe(true);
      expect(store.lager().map((l) => [l.name, l.reihenfolge])).toEqual([
        ['Küchenlager', 1],
        ['Kaltlager', 2],
      ]);
    });

    it('prüft einen doppelten Namen vorab, ohne zu schreiben', async () => {
      await store.lagerAnlegen('Kaltlager');
      const vorher = storage.schreibzugriffe;
      expect(await store.lagerAnlegen('  kaltlager')).toBe(false);
      expect(store.fehler()).toBe('Dieses Lager gibt es schon.');
      expect(storage.schreibzugriffe).toBe(vorher);
    });

    it('schreibt bei leerem Namen und unveränderter Umbenennung nichts', async () => {
      await store.lagerAnlegen('Kaltlager');
      const [lager] = store.lager();
      const vorher = storage.schreibzugriffe;
      expect(await store.lagerAnlegen('   ')).toBe(false);
      expect(await store.lagerUmbenennen(lager, ' ')).toBe(false);
      expect(await store.lagerUmbenennen(lager, 'Kaltlager')).toBe(false);
      expect(storage.schreibzugriffe).toBe(vorher);
    });

    it('benennt um und übernimmt die neue Version', async () => {
      await store.lagerAnlegen('Kaltlager');
      const [lager] = store.lager();
      expect(await store.lagerUmbenennen(lager, 'Kühllager')).toBe(true);
      expect(store.lager()[0]).toMatchObject({ name: 'Kühllager', version: 2 });
    });

    it('meldet einen Versionskonflikt und markiert ihn', async () => {
      await store.lagerAnlegen('Kaltlager');
      const veraltet = { ...store.lager()[0] };
      await store.lagerUmbenennen(veraltet, 'Eins');
      expect(await store.lagerUmbenennen(veraltet, 'Zwei')).toBe(false);
      expect(store.konflikt()).toBe(true);
      expect(store.lager()[0].name).toBe('Eins');
    });

    it('löscht ein Lager ohne Artikel und sperrt eines mit Artikeln', async () => {
      await store.lagerAnlegen('Leer');
      await store.lagerAnlegen('Voll');
      const [leer, voll] = store.lager();
      await store.artikelAnlegen({ name: 'Besen', einheit: 'Stück', lagerId: voll.id });
      const vorher = storage.schreibzugriffe;
      expect(await store.lagerLoeschen(voll)).toBe(false);
      expect(store.fehler()).toBe('Dieses Lager ist noch Heimatlager von Artikeln.');
      expect(storage.schreibzugriffe).toBe(vorher);
      expect(await store.lagerLoeschen(leer)).toBe(true);
      expect(store.lager().map((l) => l.name)).toEqual(['Voll']);
    });

    it('verschiebt ein Lager und zeigt die neue Reihenfolge', async () => {
      for (const name of ['A', 'B', 'C']) await store.lagerAnlegen(name);
      expect(await store.lagerVerschieben(2, 0)).toBe(true);
      expect(store.lager().map((l) => [l.name, l.reihenfolge])).toEqual([
        ['C', 1],
        ['A', 2],
        ['B', 3],
      ]);
    });

    it('ignoriert ein Verschieben ohne Wirkung', async () => {
      await store.lagerAnlegen('A');
      await store.lagerAnlegen('B');
      const vorher = storage.schreibzugriffe;
      expect(await store.lagerVerschieben(1, 1)).toBe(false);
      expect(await store.lagerVerschieben(0, 5)).toBe(false);
      expect(await store.lagerVerschieben(-1, 0)).toBe(false);
      expect(storage.schreibzugriffe).toBe(vorher);
    });

    it('stellt die alte Reihenfolge wieder her, wenn das Speichern scheitert', async () => {
      for (const name of ['A', 'B']) await store.lagerAnlegen(name);
      storage.setzeLagerReihenfolge = () => Promise.reject(new Error('Server nicht erreichbar'));
      expect(await store.lagerVerschieben(1, 0)).toBe(false);
      expect(store.lager().map((l) => l.name)).toEqual(['A', 'B']);
      expect(store.fehler()).toBe('Server nicht erreichbar');
    });

    it('begrenzt die Zahl der Lager', async () => {
      store.lager.set(
        Array.from({ length: 100 }, (_, n) =>
          erzeugeTestLager({ name: `L${n}`, reihenfolge: n + 1 }),
        ),
      );
      expect(await store.lagerAnlegen('Zu viel')).toBe(false);
      expect(store.fehler()).toContain('höchstens 100');
    });
  });

  describe('Artikel', () => {
    it('legt an, sortiert alphabetisch und ändert Einheit und Heimatlager', async () => {
      await store.lagerAnlegen('Kaltlager');
      const lager = store.lager()[0];
      await store.artikelAnlegen({ name: 'Zucker', einheit: 'Packung', lagerId: null });
      await store.artikelAnlegen({ name: 'Besen', einheit: 'Stück', lagerId: null });
      expect(store.artikel().map((a) => a.name)).toEqual(['Besen', 'Zucker']);
      const besen = store.artikel()[0];
      expect(await store.artikelAendern(besen, { lagerId: lager.id, einheit: 'Satz' })).toBe(true);
      expect(store.artikel()[0]).toMatchObject({ lagerId: lager.id, einheit: 'Satz', version: 2 });
      expect(store.artikelJeLager().get(lager.id)).toBe(1);
    });

    it('prüft einen doppelten Namen vorab und schreibt Unverändertes nicht', async () => {
      await store.artikelAnlegen({ name: 'Besen', einheit: 'Stück', lagerId: null });
      await store.artikelAnlegen({ name: 'Zucker', einheit: 'Packung', lagerId: null });
      const [besen, zucker] = store.artikel();
      const vorher = storage.schreibzugriffe;
      expect(await store.artikelAnlegen({ name: ' BESEN ', einheit: 'Stück', lagerId: null })).toBe(
        false,
      );
      expect(await store.artikelAendern(zucker, { name: 'besen' })).toBe(false);
      expect(store.fehler()).toBe('Diesen Artikel gibt es schon.');
      expect(await store.artikelAendern(besen, {})).toBe(false);
      expect(await store.artikelAendern(besen, { name: 'Besen' })).toBe(false);
      expect(storage.schreibzugriffe).toBe(vorher);
    });

    it('löscht einen Artikel und meldet einen Konflikt bei veralteter Version', async () => {
      await store.artikelAnlegen({ name: 'Besen', einheit: 'Stück', lagerId: null });
      const veraltet = { ...store.artikel()[0], version: 9 };
      expect(await store.artikelLoeschen(veraltet)).toBe(false);
      expect(store.konflikt()).toBe(true);
      expect(await store.artikelLoeschen(store.artikel()[0])).toBe(true);
      expect(store.artikel()).toEqual([]);
    });
  });
});
