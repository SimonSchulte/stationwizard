import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiFahrzeugStorage } from '../storage/api-fahrzeug-storage';
import { InMemoryFahrzeugStorage } from '../testing/in-memory-fahrzeug-storage';
import { erzeugeTestfahrzeug } from '../testing/fahrzeug-testdaten';
import { FahrzeugImportStoreService } from './fahrzeug-import-store.service';

const INHALT = 'bezeichnung;kennzeichen\nMTW 1;XY-TE 123\nGW-San;XY-TE 456\n';

function datei(inhalt: string, name = 'fahrzeuge.csv'): File {
  return new File([inhalt], name, { type: 'text/csv' });
}

describe('Stammdatenimport-Store', () => {
  let speicher: InMemoryFahrzeugStorage;
  let store: FahrzeugImportStoreService;

  beforeEach(() => {
    speicher = new InMemoryFahrzeugStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiFahrzeugStorage, useValue: speicher }],
    });
    store = TestBed.inject(FahrzeugImportStoreService);
  });

  it('legt die übernehmbaren Zeilen an', async () => {
    await store.dateiEinlesen(datei(INHALT));
    expect(store.gesamt()).toBe(2);
    await store.importStarten();
    expect((await speicher.ladeFahrzeuge()).map((f) => f.kennzeichen).sort()).toEqual([
      'XY-TE 123',
      'XY-TE 456',
    ]);
    expect(store.angelegteAnzahl()).toBe(2);
    expect(store.erledigt()).toBe(2);
  });

  it('legt bei einem zweiten Lauf derselben Datei nichts mehr an', async () => {
    await store.dateiEinlesen(datei(INHALT));
    await store.importStarten();
    await store.dateiEinlesen(datei(INHALT));
    expect(store.gesamt()).toBe(0);
    expect(store.vorschau().zeilen.every((z) => z.befund === 'dublette-bestand')).toBe(true);
    await store.importStarten();
    expect(await speicher.ladeFahrzeuge()).toHaveLength(2);
    expect(store.angelegteAnzahl()).toBe(0);
  });

  it('weist ein zwischenzeitlich angelegtes Kennzeichen vor dem Schreiben ab', async () => {
    await store.dateiEinlesen(datei(INHALT));
    expect(store.gesamt()).toBe(2);
    // Jemand anderes legt dasselbe Fahrzeug an, während die Vorschau offen ist.
    await speicher.speichereFahrzeug(
      erzeugeTestfahrzeug({ kennzeichen: 'xy te 123', bezeichnung: 'Fremd' }),
      null,
    );
    await store.importStarten();
    const angelegt = await speicher.ladeFahrzeuge();
    expect(angelegt).toHaveLength(2);
    expect(store.angelegteAnzahl()).toBe(1);
    const abgewiesen = store.ergebnisse().find((e) => !e.angelegt);
    expect(abgewiesen?.kennzeichen).toBe('XY-TE 123');
    expect(abgewiesen?.grund).toContain('bereits ein Fahrzeug angelegt');
  });

  it('setzt den Lauf nach einem Fehler in einer Zeile fort', async () => {
    let erster = true;
    const gestoert = {
      ...speicher,
      bezeichnung: speicher.bezeichnung,
      ladeFahrzeuge: () => speicher.ladeFahrzeuge(),
      speichereFahrzeug: async (fahrzeug: Parameters<typeof speicher.speichereFahrzeug>[0]) => {
        if (erster) {
          erster = false;
          throw new Error('Netzwerk nicht erreichbar.');
        }
        return speicher.speichereFahrzeug(fahrzeug, null);
      },
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiFahrzeugStorage, useValue: gestoert }],
    });
    const gestoerterStore = TestBed.inject(FahrzeugImportStoreService);
    await gestoerterStore.dateiEinlesen(datei(INHALT));
    await gestoerterStore.importStarten();
    expect(gestoerterStore.ergebnisse().map((e) => e.angelegt)).toEqual([false, true]);
    expect(gestoerterStore.ergebnisse()[0].grund).toBe('Netzwerk nicht erreichbar.');
  });

  it('nimmt fehlerhafte Zeilen in den Bericht auf, ohne sie anzulegen', async () => {
    await store.dateiEinlesen(datei('bezeichnung;kennzeichen\nMTW 1;XY-TE 123\n;XY-TE 456\n'));
    await store.importStarten();
    expect(await speicher.ladeFahrzeuge()).toHaveLength(1);
    expect(store.ergebnisse().map((e) => e.angelegt)).toEqual([true, false]);
    expect(store.ergebnisse()[1].grund).toContain('Bezeichnung fehlt.');
  });

  it('startet keinen zweiten Lauf, solange einer läuft', async () => {
    await store.dateiEinlesen(datei(INHALT));
    const erster = store.importStarten();
    const zweiter = store.importStarten();
    await Promise.all([erster, zweiter]);
    expect(await speicher.ladeFahrzeuge()).toHaveLength(2);
  });

  it('sperrt den Import bei fehlender Pflichtspalte', async () => {
    await store.dateiEinlesen(datei('bezeichnung;funkrufname\nMTW 1;1/19/1'));
    expect(store.bereit()).toBe(false);
    await store.importStarten();
    expect(await speicher.ladeFahrzeuge()).toHaveLength(0);
  });

  it('sperrt den Knopf nach einem abgeschlossenen Lauf, bis eine Datei neu gewählt wird', async () => {
    await store.dateiEinlesen(datei(INHALT));
    expect(store.bereit()).toBe(true);
    await store.importStarten();
    expect(store.bereit()).toBe(false);
    store.zuruecksetzen();
    await store.dateiEinlesen(datei('bezeichnung;kennzeichen\nRTW;XY-TE 789\n'));
    expect(store.bereit()).toBe(true);
  });

  it('vergisst beim Zurücksetzen Datei, Vorschau und Bericht', async () => {
    await store.dateiEinlesen(datei(INHALT));
    await store.importStarten();
    store.zuruecksetzen();
    expect(store.dateiname()).toBe('');
    expect(store.vorschau().zeilen).toEqual([]);
    expect(store.ergebnisse()).toEqual([]);
  });
});
