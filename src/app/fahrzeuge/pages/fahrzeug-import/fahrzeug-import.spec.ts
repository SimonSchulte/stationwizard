import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { ImportVorschau } from '../../services/fahrzeug-import';
import { FahrzeugImportStoreService } from '../../services/fahrzeug-import-store.service';
import { FahrzeugImport } from './fahrzeug-import';

const LEER: ImportVorschau = { spaltenfehler: [], hinweise: [], zeilen: [] };

function storeStub(ueberschreibung: Record<string, unknown> = {}) {
  return {
    dateiname: signal(''),
    liestEin: signal(false),
    fehler: signal(''),
    vorschau: signal<ImportVorschau>(LEER),
    laeuftGerade: signal(false),
    erledigt: signal(0),
    gesamt: signal(0),
    bereit: signal(false),
    ergebnisse: signal([]),
    angelegteAnzahl: signal(0),
    dateiEinlesen: vi.fn().mockResolvedValue(undefined),
    importStarten: vi.fn().mockResolvedValue(undefined),
    zuruecksetzen: vi.fn(),
    ...ueberschreibung,
  };
}

function erzeuge(store: ReturnType<typeof storeStub>, dialog: Record<string, unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: FahrzeugImportStoreService, useValue: store },
      { provide: DialogDienst, useValue: dialog },
    ],
  });
  return TestBed.runInInjectionContext(() => new FahrzeugImport());
}

/** jsdom kennt kein `DataTransfer`; die Komponente liest nur `files` und setzt `value`. */
function dateiEreignis(datei: File | null): Event {
  const eingabe = { files: datei ? [datei] : [], value: 'fahrzeuge.csv' };
  return { target: eingabe } as unknown as Event;
}

describe('Fahrzeug-Importseite', () => {
  let dialog: { bestaetigen: ReturnType<typeof vi.fn>; hinweis: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dialog = { bestaetigen: vi.fn().mockResolvedValue(true), hinweis: vi.fn() };
  });

  it('reicht die gewählte Datei an den Store weiter', () => {
    const store = storeStub();
    const seite = erzeuge(store, dialog);
    const datei = new File(['bezeichnung;kennzeichen'], 'fahrzeuge.csv', { type: 'text/csv' });
    seite.dateiGewaehlt(dateiEreignis(datei));
    expect(store.dateiEinlesen).toHaveBeenCalledWith(datei);
  });

  it('ignoriert einen abgebrochenen Dateidialog', () => {
    const store = storeStub();
    const seite = erzeuge(store, dialog);
    seite.dateiGewaehlt(dateiEreignis(null));
    expect(store.dateiEinlesen).not.toHaveBeenCalled();
  });

  it('fragt vor dem Anlegen nach und startet erst nach Zustimmung', async () => {
    const store = storeStub({ gesamt: signal(3), bereit: signal(true) });
    const seite = erzeuge(store, dialog);
    await seite.importStarten();
    expect(dialog.bestaetigen).toHaveBeenCalledOnce();
    expect(store.importStarten).toHaveBeenCalledOnce();
  });

  it('startet nichts, wenn die Nachfrage abgelehnt wird', async () => {
    dialog.bestaetigen.mockResolvedValue(false);
    const store = storeStub({ gesamt: signal(3), bereit: signal(true) });
    const seite = erzeuge(store, dialog);
    await seite.importStarten();
    expect(store.importStarten).not.toHaveBeenCalled();
  });

  it('zählt die Befunde der Vorschau', () => {
    const store = storeStub({
      vorschau: signal<ImportVorschau>({
        spaltenfehler: [],
        hinweise: [],
        zeilen: [
          {
            zeilennummer: 2,
            kennzeichen: 'A',
            bezeichnung: 'a',
            fahrzeug: null,
            befund: 'uebernehmen',
            meldungen: [],
          },
          {
            zeilennummer: 3,
            kennzeichen: 'B',
            bezeichnung: 'b',
            fahrzeug: null,
            befund: 'fehler',
            meldungen: [],
          },
          {
            zeilennummer: 4,
            kennzeichen: 'C',
            bezeichnung: 'c',
            fahrzeug: null,
            befund: 'dublette-bestand',
            meldungen: [],
          },
        ],
      }),
    });
    const seite = erzeuge(store, dialog);
    expect(seite.anzahlJeBefund()).toEqual({
      uebernehmen: 1,
      fehler: 1,
      'dublette-datei': 0,
      'dublette-bestand': 1,
    });
  });

  it('rechnet den Fortschritt in Prozent um und kommt ohne Zeilen zurecht', () => {
    expect(erzeuge(storeStub(), dialog).fortschritt()).toBe(0);
    const store = storeStub({ gesamt: signal(4), erledigt: signal(1) });
    expect(erzeuge(store, dialog).fortschritt()).toBe(25);
  });

  it('setzt den Store für eine andere Datei zurück', () => {
    const store = storeStub();
    erzeuge(store, dialog).neueDatei();
    expect(store.zuruecksetzen).toHaveBeenCalledOnce();
  });
});
