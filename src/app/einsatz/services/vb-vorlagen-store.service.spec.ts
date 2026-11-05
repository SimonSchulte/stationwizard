import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiVbVorlagenStorage } from '../storage/api-vb-vorlagen-storage';
import { InMemoryVbVorlagenStorage } from '../testing/in-memory-einsatzplanung';
import { testVorlage } from '../testing/vb-testdaten';
import { VbVorlagenStoreService } from './vb-vorlagen-store.service';

describe('VbVorlagenStoreService', () => {
  let storage: InMemoryVbVorlagenStorage;
  let store: VbVorlagenStoreService;

  beforeEach(() => {
    storage = new InMemoryVbVorlagenStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiVbVorlagenStorage, useValue: storage }],
    });
    store = TestBed.inject(VbVorlagenStoreService);
  });

  it('lädt die Liste alphabetisch', async () => {
    storage._vorbelegen(testVorlage({ titel: 'Zebra' }));
    storage._vorbelegen(testVorlage({ titel: 'Ärzte' }));
    storage._vorbelegen(testVorlage({ titel: 'Markt' }));
    await store.laden();
    expect(store.vorlagen().map((v) => v.titel)).toEqual(['Ärzte', 'Markt', 'Zebra']);
  });

  it('legt an, speichert und löscht und aktualisiert dabei die Liste', async () => {
    const vorlage = testVorlage();
    const v1 = await store.anlegen(vorlage);
    expect(v1).toBe('"1"');
    expect(store.vorlagen()).toHaveLength(1);

    const v2 = await store.speichern({ ...vorlage, titel: 'Neu' }, v1!);
    expect(v2).toBe('"2"');
    expect(store.vorlagen()[0]).toMatchObject({ titel: 'Neu', version: 2 });

    expect(await store.loeschen(vorlage.id, v2!)).toBe(true);
    expect(store.vorlagen()).toEqual([]);
  });

  it('meldet einen Versionskonflikt als Zustand', async () => {
    const vorlage = testVorlage();
    await store.anlegen(vorlage);
    expect(await store.speichern(vorlage, '"9"')).toBeNull();
    expect(store.konflikt()).toBe(true);
    expect(store.fehler()).toContain('zwischenzeitlich geändert');
    expect(await store.loeschen(vorlage.id, '"9"')).toBe(false);
  });

  it('liefert bei unbekannter Vorlage null und einen Fehlertext', async () => {
    expect(await store.vorlageLaden(crypto.randomUUID())).toBeNull();
    expect(store.fehler()).toContain('nicht gefunden');
  });
});
