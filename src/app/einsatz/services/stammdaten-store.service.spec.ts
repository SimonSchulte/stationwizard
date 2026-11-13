import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiStammdatenStorage } from '../storage/api-stammdaten-storage';
import { InMemoryStammdatenStorage } from '../testing/in-memory-stammdaten-storage';
import {
  erzeugeTestArtikel,
  erzeugeTestKiste,
  erzeugeTestLager,
} from '../testing/stammdaten-testdaten';
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
      expect(store.fehler()).toBe('Dieses Lager ist noch Heimatlager von Artikeln oder Kisten.');
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

  describe('Plätze', () => {
    const regal = { id: 'p1', name: 'Regal' };
    const spinde = { id: 'p2', name: 'Spinde' };

    async function vorbereiten() {
      const lager = erzeugeTestLager({ id: 'l1', name: 'Kaltlager', plaetze: [regal] });
      storage._vorbelegen(
        [lager],
        [erzeugeTestArtikel({ name: 'Hammer', lagerId: 'l1', platzId: 'p1' })],
      );
      await store.laden();
      return store.lager()[0]!;
    }

    it('speichert die Plätze eines Lagers in einem Schreibvorgang', async () => {
      const lager = await vorbereiten();
      expect(
        await store.lagerPlaetzeSpeichern(lager, [regal, { ...spinde, name: ' Spinde ' }]),
      ).toBe(true);
      expect(store.lager()[0]!.plaetze.map((p) => p.name)).toEqual(['Regal', 'Spinde']);
      expect(storage.schreibzugriffe).toBe(1);
    });

    it('lehnt doppelte und leere Plätze ab und schreibt dabei nichts', async () => {
      const lager = await vorbereiten();
      expect(await store.lagerPlaetzeSpeichern(lager, [regal, { id: 'p3', name: ' REGAL ' }])).toBe(
        false,
      );
      expect(await store.lagerPlaetzeSpeichern(lager, [regal, { id: 'p3', name: ' ' }])).toBe(
        false,
      );
      expect(storage.schreibzugriffe).toBe(0);
    });

    it('sperrt das Entfernen eines Platzes, den ein Artikel verwendet', async () => {
      const lager = await vorbereiten();
      expect(store.verwendungJePlatz().get('p1')).toBe(1);
      expect(await store.lagerPlaetzeSpeichern(lager, [])).toBe(false);
      expect(store.lager()[0]!.plaetze).toHaveLength(1);
      expect(storage.schreibzugriffe).toBe(0);
    });

    it('setzt den Platz eines Artikels zurück, sobald sein Heimatlager wechselt', async () => {
      const lager2 = erzeugeTestLager({ id: 'l2', name: 'Küchenlager', reihenfolge: 2 });
      const lager1 = erzeugeTestLager({ id: 'l1', name: 'Kaltlager', plaetze: [regal] });
      storage._vorbelegen(
        [lager1, lager2],
        [erzeugeTestArtikel({ id: 'a1', name: 'Hammer', lagerId: 'l1', platzId: 'p1' })],
      );
      await store.laden();
      const hammer = store.artikel()[0]!;
      await store.artikelAendern(hammer, { lagerId: 'l2' });
      expect(store.artikel()[0]).toMatchObject({ lagerId: 'l2', platzId: null });
    });
  });

  describe('lagerMitPlaetzenSicherstellen', () => {
    it('legt fehlende Lager und Plätze an und lässt vorhandene unberührt', async () => {
      const kaltlager = erzeugeTestLager({
        id: 'l1',
        name: 'Kaltlager',
        plaetze: [{ id: 'p1', name: 'Regal' }],
      });
      storage._vorbelegen([kaltlager], []);
      await store.laden();

      const vorhanden = await store.lagerMitPlaetzenSicherstellen(' kaltlager ', [
        'regal',
        'Spinde',
        'Spinde',
      ]);
      expect(vorhanden?.id).toBe('l1');
      expect(vorhanden?.plaetze.map((p) => p.name)).toEqual(['Regal', 'Spinde']);
      expect(vorhanden?.plaetze[0]!.id).toBe('p1');

      const neu = await store.lagerMitPlaetzenSicherstellen('Küchenlager', ['Boden']);
      expect(neu?.name).toBe('Küchenlager');
      expect(neu?.plaetze.map((p) => p.name)).toEqual(['Boden']);
      expect(store.lager().map((l) => l.name)).toEqual(['Kaltlager', 'Küchenlager']);
    });

    it('schreibt nichts, wenn Lager und Plätze schon da sind', async () => {
      storage._vorbelegen(
        [erzeugeTestLager({ id: 'l1', name: 'Kaltlager', plaetze: [{ id: 'p1', name: 'Regal' }] })],
        [],
      );
      await store.laden();
      await store.lagerMitPlaetzenSicherstellen('Kaltlager', ['Regal']);
      expect(storage.schreibzugriffe).toBe(0);
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

    it('behält eine mitgegebene Id und findet Artikel über die Vergleichsform des Namens', async () => {
      const id = crypto.randomUUID();
      await store.artikelAnlegen({ id, name: 'Absperr  Band', einheit: 'Rolle', lagerId: null });
      expect(store.artikelNachId().get(id)?.name).toBe('Absperr Band');
      expect(store.artikelFinden(' absperr band ')?.id).toBe(id);
      expect(store.artikelFinden('Hammer')).toBeUndefined();
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

  describe('Kisten', () => {
    it('lädt die Kisten alphabetisch und zählt sie je Lager und Artikel', async () => {
      storage._vorbelegen(
        [erzeugeTestLager({ id: 'l1' })],
        [erzeugeTestArtikel({ id: 'a1' }), erzeugeTestArtikel({ id: 'a2' })],
        [
          erzeugeTestKiste({
            name: 'Zweite',
            lagerId: 'l1',
            inhalt: [{ artikelId: 'a1', menge: 1, bemerkung: '' }],
          }),
          erzeugeTestKiste({
            name: 'Erste',
            lagerId: 'l1',
            inhalt: [
              { artikelId: 'a1', menge: 1, bemerkung: '' },
              { artikelId: 'a2', menge: 1, bemerkung: '' },
            ],
          }),
        ],
      );
      await store.laden();
      expect(store.kisten().map((k) => k.name)).toEqual(['Erste', 'Zweite']);
      expect(store.kistenJeLager().get('l1')).toBe(2);
      expect(store.kistenJeArtikel().get('a1')).toBe(2);
      expect(store.kistenJeArtikel().get('a2')).toBe(1);
    });

    it('legt eine leere Kiste an und liefert sie zurück', async () => {
      const kiste = await store.kisteAnlegen('  Gewürzkiste ');
      expect(kiste).toMatchObject({ name: 'Gewürzkiste', inhalt: [], lagerId: null, version: 1 });
      expect(store.kisten()).toHaveLength(1);
    });

    it('prüft einen doppelten Namen, leeren Namen und die Grenze vorab', async () => {
      await store.kisteAnlegen('Eins');
      const vorher = storage.schreibzugriffe;
      expect(await store.kisteAnlegen(' EINS ')).toBeNull();
      expect(store.fehler()).toBe('Diese Kiste gibt es schon.');
      expect(await store.kisteAnlegen('   ')).toBeNull();
      store.kisten.set(Array.from({ length: 300 }, (_, n) => erzeugeTestKiste({ name: `K${n}` })));
      expect(await store.kisteAnlegen('Zu viel')).toBeNull();
      expect(store.fehler()).toContain('höchstens 300');
      expect(storage.schreibzugriffe).toBe(vorher);
    });

    it('speichert Name, Heimatlager und Inhalt in einem Schreibvorgang', async () => {
      const kiste = (await store.kisteAnlegen('Alt'))!;
      const vorher = storage.schreibzugriffe;
      const gespeichert = await store.kisteSpeichern(kiste, {
        name: ' Neu ',
        lagerId: null,
        inhalt: [{ artikelId: 'a1', menge: 3, bemerkung: 'voll' }],
      });
      expect(gespeichert).toMatchObject({ name: 'Neu', version: 2 });
      expect(store.kisten()[0].inhalt).toEqual([{ artikelId: 'a1', menge: 3, bemerkung: 'voll' }]);
      expect(storage.schreibzugriffe).toBe(vorher + 1);
    });

    it('lehnt leeren und doppelten Namen beim Speichern ab, ohne zu schreiben', async () => {
      await store.kisteAnlegen('Eins');
      const zwei = (await store.kisteAnlegen('Zwei'))!;
      const vorher = storage.schreibzugriffe;
      expect(await store.kisteSpeichern(zwei, { name: ' ', lagerId: null, inhalt: [] })).toBeNull();
      expect(
        await store.kisteSpeichern(zwei, { name: 'eins', lagerId: null, inhalt: [] }),
      ).toBeNull();
      expect(store.fehler()).toBe('Diese Kiste gibt es schon.');
      expect(storage.schreibzugriffe).toBe(vorher);
    });

    it('meldet einen Versionskonflikt beim Speichern', async () => {
      const kiste = (await store.kisteAnlegen('Eins'))!;
      await store.kisteSpeichern(kiste, { name: 'Eins', lagerId: null, inhalt: [] });
      expect(
        await store.kisteSpeichern(kiste, { name: 'Zwei', lagerId: null, inhalt: [] }),
      ).toBeNull();
      expect(store.konflikt()).toBe(true);
    });

    it('löscht eine Kiste', async () => {
      const kiste = (await store.kisteAnlegen('Eins'))!;
      expect(await store.kisteLoeschen(kiste)).toBe(true);
      expect(store.kisten()).toEqual([]);
    });

    it('sperrt das Löschen eines Artikels in einer Kiste und eines Lagers mit Kisten', async () => {
      await store.lagerAnlegen('Lager');
      const lager = store.lager()[0];
      await store.artikelAnlegen({ name: 'Öl', einheit: 'Liter', lagerId: null });
      const artikel = store.artikel()[0];
      const kiste = (await store.kisteAnlegen('Kiste'))!;
      await store.kisteSpeichern(kiste, {
        name: 'Kiste',
        lagerId: lager.id,
        inhalt: [{ artikelId: artikel.id, menge: 1, bemerkung: '' }],
      });
      const vorher = storage.schreibzugriffe;
      expect(await store.artikelLoeschen(artikel)).toBe(false);
      expect(store.fehler()).toBe('Dieser Artikel ist noch in einer Kiste enthalten.');
      expect(await store.lagerLoeschen(lager)).toBe(false);
      expect(store.fehler()).toContain('Heimatlager von Artikeln oder Kisten');
      expect(storage.schreibzugriffe).toBe(vorher);
    });
  });
});
