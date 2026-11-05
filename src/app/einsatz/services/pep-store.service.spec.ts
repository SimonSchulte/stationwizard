import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PepInhalt } from '../models/pep.model';
import { Planung } from '../models/planung.model';
import { ApiPepStorage } from '../storage/api-pep-storage';
import { ApiPepVorlagenStorage } from '../storage/api-pep-vorlagen-storage';
import {
  InMemoryPepStorage,
  InMemoryPepVorlagenStorage,
} from '../testing/in-memory-einsatzplanung';
import { testPep, testPepInhalt, testPepVorlage } from '../testing/pep-testdaten';
import { pepInhaltZuPlanung } from './pep-abbildung';
import { PepStoreService } from './pep-store.service';

describe('PepStoreService', () => {
  let peps: InMemoryPepStorage;
  let vorlagen: InMemoryPepVorlagenStorage;
  let store: PepStoreService;
  const einsatzId = crypto.randomUUID();

  beforeEach(() => {
    peps = new InMemoryPepStorage();
    vorlagen = new InMemoryPepVorlagenStorage();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiPepStorage, useValue: peps },
        { provide: ApiPepVorlagenStorage, useValue: vorlagen },
      ],
    });
    store = TestBed.inject(PepStoreService);
  });

  it('lädt mit Version und meldet eine fehlende PEP als Zustand', async () => {
    expect(await store.laden(einsatzId)).toBeNull();
    expect(store.nichtGefunden()).toBe(true);
    expect(store.fehler()).toBe('');

    peps._vorbelegen(einsatzId, testPep());
    const stand = await store.laden(einsatzId);
    expect(stand?.version).toBe('"1"');
    expect(store.nichtGefunden()).toBe(false);
    expect(store.geladen()?.daten.inhalt.beschreibung).toBe('Übungsdienst');
  });

  it('speichert mit If-Match, behält die vorlageId und führt die Version nach', async () => {
    const vorlageId = crypto.randomUUID();
    peps._vorbelegen(einsatzId, testPep({ vorlageId }));
    await store.laden(einsatzId);
    const neu: PepInhalt = { ...testPepInhalt(), beschreibung: 'Geändert' };
    expect(await store.speichern(einsatzId, neu)).toBe(true);
    expect(store.geladen()?.version).toBe('"2"');
    expect((await peps.ladePep(einsatzId))?.daten).toMatchObject({
      vorlageId,
      inhalt: { beschreibung: 'Geändert' },
    });
    // Zweites Speichern mit der nachgeführten Version gelingt.
    expect(await store.speichern(einsatzId, neu)).toBe(true);
  });

  it('bewahrt einen Konflikt, ohne den gehaltenen Stand zu überschreiben', async () => {
    peps._vorbelegen(einsatzId, testPep());
    await store.laden(einsatzId);
    // Jemand anderes speichert zwischendurch.
    await peps.speicherePep(einsatzId, testPep({ vorlageId: null }), '"1"');
    expect(await store.speichern(einsatzId, testPepInhalt())).toBe(false);
    expect(store.konflikt()).toBe(true);
    expect(store.fehler()).toContain('zwischenzeitlich geändert');
    expect(store.geladen()?.version).toBe('"1"');
    // Erst ein bewusstes Neuladen löst den Zustand.
    await store.laden(einsatzId);
    expect(store.konflikt()).toBe(false);
    expect(store.geladen()?.version).toBe('"2"');
  });

  it('schreibt ohne geladenen Stand oder mit ungültigem Inhalt nichts', async () => {
    expect(await store.speichern(einsatzId, testPepInhalt())).toBe(false);
    expect(store.fehler()).toContain('nicht geladen');

    peps._vorbelegen(einsatzId, testPep());
    await store.laden(einsatzId);
    const kaputt = { ...testPepInhalt(), einsatzleiterId: 'fremd' };
    expect(await store.speichern(einsatzId, kaputt)).toBe(false);
    expect(store.fehler()).toContain('nicht speicherbar');
    expect((await peps.ladePep(einsatzId))?.version).toBe('"1"');
  });

  describe('ausVorlageAnlegen', () => {
    function basis(): Planung {
      return pepInhaltZuPlanung(testPepInhalt(), {
        id: einsatzId,
        name: 'EFS-Plan',
        start: '2026-12-05T10:00',
        end: '2026-12-05T20:00',
      });
    }

    it('legt leer an', async () => {
      expect(await store.ausVorlageAnlegen(einsatzId, null)).toBe(true);
      expect(peps.kennzahlen(einsatzId)).toEqual({ posten: 0, positionen: 0, besetzt: 0 });
      expect(store.geladen()?.daten.vorlageId).toBeNull();
      expect(store.nichtGefunden()).toBe(false);
    });

    it('kopiert die Posten einer Vorlage mit neuen Ids und merkt sich die Vorlage', async () => {
      const vorlage = testPepVorlage();
      vorlagen._vorbelegen(vorlage);
      expect(await store.ausVorlageAnlegen(einsatzId, vorlage.id)).toBe(true);
      const pep = (await peps.ladePep(einsatzId))!.daten;
      expect(pep.vorlageId).toBe(vorlage.id);
      expect(pep.inhalt.posten[0].bezeichnung).toBe('Sanitätsstation');
      expect(pep.inhalt.posten[0].id).not.toBe(vorlage.inhalt.posten[0].id);
      expect(pep.inhalt.einsatzkraefte).toEqual([]);
      expect(peps.kennzahlen(einsatzId)).toEqual({ posten: 1, positionen: 2, besetzt: 0 });
    });

    it('übernimmt mit Vorlage und Basis die Einsatzkräfte der Basis, die Posten der Vorlage', async () => {
      const vorlage = testPepVorlage();
      vorlage.inhalt.posten[0].bezeichnung = 'Aus der Vorlage';
      vorlagen._vorbelegen(vorlage);
      expect(await store.ausVorlageAnlegen(einsatzId, vorlage.id, basis())).toBe(true);
      const inhalt = (await peps.ladePep(einsatzId))!.daten.inhalt;
      expect(inhalt.posten[0].bezeichnung).toBe('Aus der Vorlage');
      expect(inhalt.einsatzkraefte.map((k) => k.name)).toEqual(['Testperson Nord']);
      expect(inhalt.einsatzleiterId).toBeNull();
      expect(inhalt.posten[0].positionen.every((p) => p.einsatzkraftId === null)).toBe(true);
    });

    it('übernimmt ohne Vorlage die Posten und Einsatzkräfte der Basis', async () => {
      expect(await store.ausVorlageAnlegen(einsatzId, null, basis())).toBe(true);
      const inhalt = (await peps.ladePep(einsatzId))!.daten.inhalt;
      expect(inhalt.posten[0].bezeichnung).toBe('Sanitätsstation');
      expect(inhalt.einsatzkraefte).toHaveLength(1);
      expect(inhalt.posten[0].positionen[0].einsatzkraftId).toBe('kraft-1');
    });

    it('meldet eine unbekannte Vorlage und legt nichts an', async () => {
      expect(await store.ausVorlageAnlegen(einsatzId, crypto.randomUUID())).toBe(false);
      expect(store.fehler()).toContain('nicht gefunden');
      expect(await peps.ladePep(einsatzId)).toBeNull();
    });

    it('meldet, dass es schon eine PEP gibt', async () => {
      peps._vorbelegen(einsatzId, testPep());
      expect(await store.ausVorlageAnlegen(einsatzId, null)).toBe(false);
      expect(store.fehler()).toContain('existiert bereits');
      expect(store.konflikt()).toBe(false);
    });
  });

  it('löscht mit If-Match', async () => {
    peps._vorbelegen(einsatzId, testPep());
    await store.laden(einsatzId);
    expect(await store.loeschen(einsatzId)).toBe(true);
    expect(await peps.ladePep(einsatzId)).toBeNull();
    expect(store.geladen()).toBeNull();
    expect(store.nichtGefunden()).toBe(true);
  });

  describe('alsVorlageSpeichern', () => {
    it('speichert Posten ohne Besetzung als Vorlage und liefert ihre Id', async () => {
      const planung = pepInhaltZuPlanung(testPepInhalt(), {
        id: einsatzId,
        name: 'x',
        start: 'a',
        end: 'b',
      });
      const id = await store.alsVorlageSpeichern('  Meine Vorlage ', planung);
      expect(id).not.toBeNull();
      const gespeichert = (await vorlagen.ladeVorlage(id!))!.daten;
      expect(gespeichert.titel).toBe('Meine Vorlage');
      expect(gespeichert.inhalt.posten[0].positionen.map((p) => p.einsatzkraftId)).toEqual([
        null,
        null,
      ]);
      expect(gespeichert.inhalt).not.toHaveProperty('einsatzkraefte');
    });

    it('lehnt einen leeren Titel ab, ohne zu schreiben', async () => {
      const planung = pepInhaltZuPlanung(testPepInhalt(), {
        id: einsatzId,
        name: 'x',
        start: 'a',
        end: 'b',
      });
      expect(await store.alsVorlageSpeichern('   ', planung)).toBeNull();
      expect(store.fehler()).toContain('nicht speicherbar');
      expect(await vorlagen.ladeVorlagen()).toEqual([]);
    });
  });
});
