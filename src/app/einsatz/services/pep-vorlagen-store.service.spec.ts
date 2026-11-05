import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiPepVorlagenStorage } from '../storage/api-pep-vorlagen-storage';
import { InMemoryPepVorlagenStorage } from '../testing/in-memory-einsatzplanung';
import { testPepVorlage } from '../testing/pep-testdaten';
import { PepVorlagenStoreService } from './pep-vorlagen-store.service';

describe('PepVorlagenStoreService', () => {
  let storage: InMemoryPepVorlagenStorage;
  let store: PepVorlagenStoreService;

  beforeEach(() => {
    storage = new InMemoryPepVorlagenStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiPepVorlagenStorage, useValue: storage }],
    });
    store = TestBed.inject(PepVorlagenStoreService);
  });

  it('lädt die Liste alphabetisch', async () => {
    storage._vorbelegen(testPepVorlage({ titel: 'Zebra' }));
    storage._vorbelegen(testPepVorlage({ titel: 'Ärzte' }));
    await store.laden();
    expect(store.vorlagen().map((v) => v.titel)).toEqual(['Ärzte', 'Zebra']);
  });

  it('legt an, speichert und löscht und aktualisiert dabei die Liste', async () => {
    const vorlage = testPepVorlage();
    const v1 = await store.anlegen(vorlage);
    expect(v1).toBe('"1"');
    const v2 = await store.speichern({ ...vorlage, titel: 'Neu' }, v1!);
    expect(store.vorlagen()[0]).toMatchObject({ titel: 'Neu', version: 2 });
    expect(await store.loeschen(vorlage.id, v2!)).toBe(true);
    expect(store.vorlagen()).toEqual([]);
  });

  it('meldet einen Versionskonflikt als Zustand', async () => {
    const vorlage = testPepVorlage();
    await store.anlegen(vorlage);
    expect(await store.speichern(vorlage, '"9"')).toBeNull();
    expect(store.konflikt()).toBe(true);
    expect(store.fehler()).toContain('zwischenzeitlich geändert');
  });

  it('liefert bei unbekannter Vorlage null und einen Fehlertext', async () => {
    expect(await store.vorlageLaden(crypto.randomUUID())).toBeNull();
    expect(store.fehler()).toContain('nicht gefunden');
  });
});
