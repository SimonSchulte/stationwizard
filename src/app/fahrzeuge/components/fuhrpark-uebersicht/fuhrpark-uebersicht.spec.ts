import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { heuteIso, versetzeTage } from '../../../kern/kalender/datum';
import { Einstellungen } from '../../../systemkonfiguration/models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { FuhrparkUebersicht } from './fuhrpark-uebersicht';
import { BerichtZeile, KmBericht } from '../../models/km-bericht.model';
import { Fahrzeugstamm, Kilometerstand, Wartungstermin } from '../../models/fahrzeug.model';
import { AblesungStoreService } from '../../services/ablesung-store.service';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { KmBerichtStoreService } from '../../services/km-bericht-store.service';
import { erzeugeTestfahrzeug, erzeugeTestwartung } from '../../testing/fahrzeug-testdaten';

function berichtZeile(ueberschreibung: Partial<BerichtZeile> = {}): BerichtZeile {
  return {
    id: 'f-1',
    bezeichnung: 'MTW',
    funkrufname: 'Florian 1',
    kennzeichen: 'K-XY 123',
    eigentuemer: 'land-nrw',
    letzterStand: 12_000,
    abgelesenAm: '2026-06-01',
    tageSeitAblesung: 5,
    sollKm: 1800,
    istKm: 900,
    restKm: 900,
    unvollstaendig: false,
    ...ueberschreibung,
  };
}

function fahrzeugeStoreMock(fahrzeuge: Fahrzeugstamm[]) {
  const entwurf = signal<Fahrzeugstamm | null>(null);
  return {
    fahrzeuge: () => fahrzeuge,
    entwurf,
    fahrzeugLaden: vi.fn(async (id: string) => {
      entwurf.set(fahrzeuge.find((f) => f.id === id) ?? null);
    }),
    wartungstermineAktualisieren: vi.fn((liste: Wartungstermin[]) => {
      const aktuell = entwurf();
      if (aktuell) entwurf.set({ ...aktuell, wartungstermine: liste });
    }),
    speichern: vi.fn().mockResolvedValue(true),
    neuLadenNachKonflikt: vi.fn().mockResolvedValue(undefined),
    ladeLaeuft: () => false,
    ladeFehler: () => '',
    speicherFehler: () => '',
    speicherKonflikt: () => false,
    speichertGerade: () => false,
  };
}

function berichtStoreMock(bericht: KmBericht | null) {
  return {
    bericht: signal(bericht),
    berichtLaden: vi.fn().mockResolvedValue(undefined),
  };
}

function konfigurationMock() {
  return {
    laden: vi.fn().mockResolvedValue(undefined),
    gespeicherteEinstellungen: signal<Einstellungen | null>(null),
  };
}

function ablesungStoreMock() {
  return {
    ablesungen: signal<Kilometerstand[]>([]),
    laden: vi.fn().mockResolvedValue(undefined),
    erfassen: vi.fn().mockResolvedValue(true),
    letzteAblesung: () => null,
    erfasstGerade: () => false,
    erfassungsFehler: () => '',
  };
}

async function erzeugeUebersicht(providers: unknown[]): Promise<FuhrparkUebersicht> {
  TestBed.configureTestingModule({ providers });
  const komponente = TestBed.runInInjectionContext(() => new FuhrparkUebersicht());
  komponente.ngOnInit();
  TestBed.tick();
  await Promise.resolve();
  await Promise.resolve();
  TestBed.tick();
  return komponente;
}

const LEERER_BERICHT: KmBericht = {
  stichtag: '2026-06-15',
  jahr: 2026,
  zeilen: [],
  ohneAblesung: 0,
  unterSoll: 0,
};

describe('FuhrparkUebersicht', () => {
  it('filtert nach Eigentümer und Suchtext', async () => {
    const nrw = erzeugeTestfahrzeug({ id: 'f-nrw', bezeichnung: 'ELW', eigentuemer: 'land-nrw' });
    const bund = erzeugeTestfahrzeug({ id: 'f-bund', bezeichnung: 'GW-San', eigentuemer: 'bund' });
    const komponente = await erzeugeUebersicht([
      { provide: FahrzeugStoreService, useValue: fahrzeugeStoreMock([nrw, bund]) },
      { provide: KmBerichtStoreService, useValue: berichtStoreMock(LEERER_BERICHT) },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationMock() },
      { provide: AblesungStoreService, useValue: ablesungStoreMock() },
    ]);

    expect(komponente.gefiltert().map((e) => e.fahrzeug.id)).toEqual(['f-nrw', 'f-bund']);

    komponente.eigentuemerFilter.set('bund');
    expect(komponente.gefiltert().map((e) => e.fahrzeug.id)).toEqual(['f-bund']);

    komponente.eigentuemerFilter.set('alle');
    komponente.suche.set('elw');
    expect(komponente.gefiltert().map((e) => e.fahrzeug.id)).toEqual(['f-nrw']);
  });

  it('wählt automatisch das erste passende Fahrzeug aus und lädt Fahrzeug und Ablesungen', async () => {
    const a = erzeugeTestfahrzeug({ id: 'f-a', bezeichnung: 'A-Fahrzeug' });
    const b = erzeugeTestfahrzeug({ id: 'f-b', bezeichnung: 'B-Fahrzeug' });
    const store = fahrzeugeStoreMock([a, b]);
    const ablesung = ablesungStoreMock();
    await erzeugeUebersicht([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: KmBerichtStoreService, useValue: berichtStoreMock(LEERER_BERICHT) },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationMock() },
      { provide: AblesungStoreService, useValue: ablesung },
    ]);

    expect(store.fahrzeugLaden).toHaveBeenCalledWith('f-a');
    expect(ablesung.laden).toHaveBeenCalledWith('f-a');
  });

  it('berechnet Kilometer- und Wartungs-Ampel je Zeile', async () => {
    const kritisch = erzeugeTestfahrzeug({
      id: 'f-1',
      bezeichnung: 'Kritisch',
      eigentuemer: 'land-nrw',
      wartungstermine: [
        erzeugeTestwartung({ faelligAm: versetzeTage(heuteIso(), 10), erinnerungTage: 30 }),
      ],
    });
    const konfigurationStore = konfigurationMock();
    konfigurationStore.gespeicherteEinstellungen.set({
      kmBerichtEmpfaenger: '',
      kmBerichtVersandweg: 'email-routing',
      kmBerichtBetreff: '',
      kmAmpelSchwellenwertGelbMonate: 1,
      kmAmpelSchwellenwertRotMonate: 3,
      materialBestellscheinEmpfaenger: '',
      materialMaengelLandEmpfaenger: '',
      materialMaengelSegEmpfaenger: '',
      materialVersandweg: 'email-routing',
      materialBetreff: '',
    });
    const komponente = await erzeugeUebersicht([
      { provide: FahrzeugStoreService, useValue: fahrzeugeStoreMock([kritisch]) },
      {
        provide: KmBerichtStoreService,
        useValue: berichtStoreMock({
          ...LEERER_BERICHT,
          zeilen: [berichtZeile({ id: 'f-1', sollKm: 1800, istKm: 100, restKm: 1700 })],
        }),
      },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationStore },
      { provide: AblesungStoreService, useValue: ablesungStoreMock() },
    ]);

    const zeile = komponente.gefiltert()[0];
    expect(zeile.kmAmpel).toBe('rot');
    expect(zeile.leitTermin.ampel).toBe('warnung');
  });

  it('erfasst einen neuen Kilometerstand und lädt den Fuhrpark-Bericht neu', async () => {
    const fahrzeug = erzeugeTestfahrzeug({ id: 'f-1' });
    const berichtStore = berichtStoreMock(LEERER_BERICHT);
    const ablesung = ablesungStoreMock();
    const komponente = await erzeugeUebersicht([
      { provide: FahrzeugStoreService, useValue: fahrzeugeStoreMock([fahrzeug]) },
      { provide: KmBerichtStoreService, useValue: berichtStore },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationMock() },
      { provide: AblesungStoreService, useValue: ablesung },
    ]);

    komponente.kmEingabe.set('12345');
    komponente.kmDatum.set('2026-06-20');
    await komponente.kmErfassen();

    expect(ablesung.erfassen).toHaveBeenCalledWith({
      fahrzeugId: 'f-1',
      abgelesenAm: '2026-06-20',
      stand: 12345,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    expect(komponente.kmEingabe()).toBe('');
    expect(komponente.kmBestaetigung()).toEqual({ wert: 12345, datum: '2026-06-20' });
    // Ein Aufruf beim Start, ein zweiter nach der eigenen Schreibung.
    expect(berichtStore.berichtLaden).toHaveBeenCalledTimes(2);
  });

  it('meldet einen Wartungstermin als erledigt', async () => {
    const termin = erzeugeTestwartung({ id: 't-1', faelligAm: '2026-06-10' });
    const fahrzeug = erzeugeTestfahrzeug({ id: 'f-1', wartungstermine: [termin] });
    const store = fahrzeugeStoreMock([fahrzeug]);
    const komponente = await erzeugeUebersicht([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: KmBerichtStoreService, useValue: berichtStoreMock(LEERER_BERICHT) },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationMock() },
      { provide: AblesungStoreService, useValue: ablesungStoreMock() },
    ]);

    await komponente.terminAlsErledigtMelden('t-1');

    expect(store.wartungstermineAktualisieren).toHaveBeenCalledOnce();
    const [[uebergeben]] = store.wartungstermineAktualisieren.mock.calls;
    expect(uebergeben[0].erledigtAm).not.toBeNull();
    expect(store.speichern).toHaveBeenCalledOnce();
  });

  it('fügt einen neuen Wartungstermin hinzu und leert danach das Formular', async () => {
    const fahrzeug = erzeugeTestfahrzeug({ id: 'f-1', wartungstermine: [] });
    const store = fahrzeugeStoreMock([fahrzeug]);
    const komponente = await erzeugeUebersicht([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: KmBerichtStoreService, useValue: berichtStoreMock(LEERER_BERICHT) },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationMock() },
      { provide: AblesungStoreService, useValue: ablesungStoreMock() },
    ]);

    komponente.neuerTerminBezeichnung.set('Reifenwechsel');
    komponente.neuerTerminDatum.set('2026-09-01');
    await komponente.neuerTerminHinzufuegen();

    expect(store.wartungstermineAktualisieren).toHaveBeenCalledOnce();
    const [[liste]] = store.wartungstermineAktualisieren.mock.calls;
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      art: 'frei',
      bezeichnung: 'Reifenwechsel',
      faelligAm: '2026-09-01',
      erledigtAm: null,
    });
    expect(store.speichern).toHaveBeenCalledOnce();
    expect(komponente.neuerTerminBezeichnung()).toBe('');
  });

  it('fügt keinen Termin ohne Bezeichnung hinzu', async () => {
    const fahrzeug = erzeugeTestfahrzeug({ id: 'f-1' });
    const store = fahrzeugeStoreMock([fahrzeug]);
    const komponente = await erzeugeUebersicht([
      { provide: FahrzeugStoreService, useValue: store },
      { provide: KmBerichtStoreService, useValue: berichtStoreMock(LEERER_BERICHT) },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationMock() },
      { provide: AblesungStoreService, useValue: ablesungStoreMock() },
    ]);

    komponente.neuerTerminBezeichnung.set('   ');
    await komponente.neuerTerminHinzufuegen();

    expect(store.wartungstermineAktualisieren).not.toHaveBeenCalled();
  });
});
