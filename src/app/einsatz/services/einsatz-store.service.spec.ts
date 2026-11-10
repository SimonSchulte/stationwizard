import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import { ApiEinsatzStorage } from '../storage/api-einsatz-storage';
import { InMemoryEinsatzStorage } from '../testing/in-memory-einsatzplanung';
import { testVeranstaltung } from '../testing/veranstaltung-testdaten';
import { testEinsatz } from '../testing/druck-testdaten';
import { EinsatzStoreService } from './einsatz-store.service';

function gruppe(ueberschreibung: Partial<HiorgVeranstaltung> = {}): HiorgVeranstaltung {
  return testVeranstaltung(ueberschreibung);
}

describe('EinsatzStoreService', () => {
  let storage: InMemoryEinsatzStorage;
  let store: EinsatzStoreService;

  beforeEach(() => {
    storage = new InMemoryEinsatzStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiEinsatzStorage, useValue: storage }],
    });
    store = TestBed.inject(EinsatzStoreService);
  });

  it('lädt die Liste und meldet Fehler als Signal', async () => {
    storage._vorbelegen(testEinsatz());
    await store.laden();
    expect(store.einsaetze()).toHaveLength(1);
    expect(store.geladen()).toBe(true);

    storage.ladeEinsaetze = () => Promise.reject(new Error('kaputt'));
    await store.laden();
    expect(store.fehler()).toBe('kaputt');
  });

  it('findet den Einsatz zu einer Veranstaltung in der geladenen Liste', async () => {
    storage._vorbelegen(testEinsatz({ hiorgVeranstaltungId: 'dienst-4711' }));
    await store.laden();
    expect(store.einsatzZuVeranstaltung('dienst-4711')?.hiorgVeranstaltungId).toBe('dienst-4711');
    expect(store.einsatzZuVeranstaltung('1')).toBeNull();
  });

  it('legt den Einsatz aus der Veranstaltung an, mit Berliner Ortszeit', async () => {
    const einsatz = await store.einsatzFuerVeranstaltungSicherstellen(gruppe());
    expect(einsatz).toMatchObject({
      titel: 'Weihnachtsmarkt Ummeln',
      beginn: '2026-12-05T10:00',
      ende: '2026-12-05T20:30',
      ort: null,
      hiorgVeranstaltungId: 'dienst-4711',
    });
    expect((await storage.ladeEinsatz(einsatz!.id))?.daten).toEqual(einsatz);
    expect(store.einsatzZuVeranstaltung('dienst-4711')).not.toBeNull();
  });

  it('legt keinen zweiten Einsatz für dieselbe Veranstaltung an', async () => {
    const erster = await store.einsatzFuerVeranstaltungSicherstellen(gruppe());
    const zweiter = await store.einsatzFuerVeranstaltungSicherstellen(gruppe());
    expect(zweiter?.id).toBe(erster?.id);
    expect(await storage.ladeEinsaetze()).toHaveLength(1);
  });

  it('übernimmt bei einem Rennen den bereits angelegten Einsatz', async () => {
    const vorhanden = testEinsatz({ hiorgVeranstaltungId: 'dienst-4711' });
    const original = storage.ladeEinsaetze.bind(storage);
    let aufrufe = 0;
    // Erste Liste ist leer (der andere Aufruf war noch nicht fertig), danach sichtbar.
    storage.ladeEinsaetze = async () => {
      aufrufe += 1;
      return aufrufe === 1 ? [] : original();
    };
    storage._vorbelegen(vorhanden);
    const einsatz = await store.einsatzFuerVeranstaltungSicherstellen(gruppe());
    expect(einsatz?.id).toBe(vorhanden.id);
    expect(store.fehler()).toBe('');
  });

  it('kürzt zu lange Titel', async () => {
    const einsatz = await store.einsatzFuerVeranstaltungSicherstellen(
      gruppe({ titel: 'T'.repeat(300) }),
    );
    expect(einsatz?.titel).toHaveLength(200);
  });

  it('meldet einen Fehler beim Anlegen und liefert null', async () => {
    storage.legeEinsatzAn = () => Promise.reject(new Error('nein'));
    expect(await store.einsatzFuerVeranstaltungSicherstellen(gruppe())).toBeNull();
    expect(store.fehler()).toBe('nein');
  });
});
