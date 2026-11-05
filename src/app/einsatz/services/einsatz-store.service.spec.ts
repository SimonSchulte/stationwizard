import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EfsEinsatzGruppe } from '../models/planung.model';
import { ApiEinsatzStorage } from '../storage/api-einsatz-storage';
import { InMemoryEinsatzStorage } from '../testing/in-memory-einsatzplanung';
import { testEinsatz } from '../testing/vb-testdaten';
import { EinsatzStoreService } from './einsatz-store.service';

function gruppe(ueberschreibung: Partial<EfsEinsatzGruppe> = {}): EfsEinsatzGruppe {
  return {
    veranstaltung_id: '4711',
    titel: 'Weihnachtsmarkt Ummeln',
    datum_von: '2026-12-05T09:00:00.000Z',
    datum_bis: '2026-12-05T19:30:00.000Z',
    ort: 'Ummeln',
    schichten: [],
    ...ueberschreibung,
  };
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
    storage._vorbelegen(testEinsatz({ hiorgVeranstaltungId: '4711' }));
    await store.laden();
    expect(store.einsatzZuVeranstaltung('4711')?.hiorgVeranstaltungId).toBe('4711');
    expect(store.einsatzZuVeranstaltung('1')).toBeNull();
  });

  it('legt den Einsatz aus der Veranstaltung an, mit Berliner Ortszeit', async () => {
    const einsatz = await store.einsatzFuerVeranstaltungSicherstellen(gruppe());
    expect(einsatz).toMatchObject({
      titel: 'Weihnachtsmarkt Ummeln',
      beginn: '2026-12-05T10:00',
      ende: '2026-12-05T20:30',
      ort: 'Ummeln',
      hiorgVeranstaltungId: '4711',
    });
    expect((await storage.ladeEinsatz(einsatz!.id))?.daten).toEqual(einsatz);
    expect(store.einsatzZuVeranstaltung('4711')).not.toBeNull();
  });

  it('legt keinen zweiten Einsatz für dieselbe Veranstaltung an', async () => {
    const erster = await store.einsatzFuerVeranstaltungSicherstellen(gruppe());
    const zweiter = await store.einsatzFuerVeranstaltungSicherstellen(gruppe());
    expect(zweiter?.id).toBe(erster?.id);
    expect(await storage.ladeEinsaetze()).toHaveLength(1);
  });

  it('übernimmt bei einem Rennen den bereits angelegten Einsatz', async () => {
    const vorhanden = testEinsatz({ hiorgVeranstaltungId: '4711' });
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

  it('kürzt zu lange Titel und lässt unlesbare Zeiten leer', async () => {
    const einsatz = await store.einsatzFuerVeranstaltungSicherstellen(
      gruppe({ titel: 'T'.repeat(300), datum_von: '', datum_bis: 'bald', ort: undefined }),
    );
    expect(einsatz?.titel).toHaveLength(200);
    expect(einsatz).toMatchObject({ beginn: null, ende: null, ort: null });
  });

  it('meldet einen Fehler beim Anlegen und liefert null', async () => {
    storage.legeEinsatzAn = () => Promise.reject(new Error('nein'));
    expect(await store.einsatzFuerVeranstaltungSicherstellen(gruppe())).toBeNull();
    expect(store.fehler()).toBe('nein');
  });
});
