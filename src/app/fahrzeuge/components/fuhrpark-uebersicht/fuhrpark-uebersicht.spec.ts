import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { heuteIso, versetzeTage } from '../../../kern/kalender/datum';
import { Einstellungen } from '../../../systemkonfiguration/models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../../systemkonfiguration/services/systemkonfiguration-store.service';
import { FuhrparkUebersicht } from './fuhrpark-uebersicht';
import { BerichtZeile, KmBericht } from '../../models/km-bericht.model';
import { Fahrzeugstamm } from '../../models/fahrzeug.model';
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

/** Nur das, was die Übersicht lesen darf: die Liste. Ein Schreib- oder Einzelabruf wäre ein Fehler. */
function fahrzeugeStoreMock(fahrzeuge: Fahrzeugstamm[]) {
  return {
    fahrzeuge: () => fahrzeuge,
    fahrzeugLaden: vi.fn(),
    speichern: vi.fn(),
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

function providers(fahrzeuge: Fahrzeugstamm[], bericht: KmBericht | null = LEERER_BERICHT) {
  const store = fahrzeugeStoreMock(fahrzeuge);
  return {
    store,
    liste: [
      provideRouter([]),
      { provide: FahrzeugStoreService, useValue: store },
      { provide: KmBerichtStoreService, useValue: berichtStoreMock(bericht) },
      { provide: SystemkonfigurationStoreService, useValue: konfigurationMock() },
    ],
  };
}

async function erzeugeUebersicht(liste: unknown[]) {
  TestBed.configureTestingModule({ providers: liste });
  const fixture = TestBed.createComponent(FuhrparkUebersicht);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
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
    const komponente = (await erzeugeUebersicht(providers([nrw, bund]).liste)).componentInstance;

    expect(komponente.gefiltert().map((e) => e.fahrzeug.id)).toEqual(['f-nrw', 'f-bund']);

    komponente.eigentuemerFilter.set('bund');
    expect(komponente.gefiltert().map((e) => e.fahrzeug.id)).toEqual(['f-bund']);

    komponente.eigentuemerFilter.set('alle');
    komponente.suche.set('elw');
    expect(komponente.gefiltert().map((e) => e.fahrzeug.id)).toEqual(['f-nrw']);
  });

  it('wählt automatisch das erste passende Fahrzeug aus, ohne es einzeln nachzuladen', async () => {
    const a = erzeugeTestfahrzeug({ id: 'f-a', bezeichnung: 'A-Fahrzeug' });
    const b = erzeugeTestfahrzeug({ id: 'f-b', bezeichnung: 'B-Fahrzeug' });
    const { store, liste } = providers([a, b]);
    const komponente = (await erzeugeUebersicht(liste)).componentInstance;

    expect(komponente.ausgewaehltId()).toBe('f-a');
    komponente.auswaehlen('f-b');
    expect(komponente.ausgewaehlt()?.fahrzeug.id).toBe('f-b');
    // Die Vorschau liest nur aus der Liste: kein Einzelabruf und nichts wird geschrieben.
    expect(store.fahrzeugLaden).not.toHaveBeenCalled();
    expect(store.speichern).not.toHaveBeenCalled();
  });

  it('fällt auf das erste Fahrzeug zurück, wenn der Filter die Auswahl entfernt', async () => {
    const nrw = erzeugeTestfahrzeug({ id: 'f-nrw', bezeichnung: 'ELW', eigentuemer: 'land-nrw' });
    const bund = erzeugeTestfahrzeug({ id: 'f-bund', bezeichnung: 'GW-San', eigentuemer: 'bund' });
    const fixture = await erzeugeUebersicht(providers([nrw, bund]).liste);
    const komponente = fixture.componentInstance;

    komponente.eigentuemerFilter.set('bund');
    fixture.detectChanges();
    expect(komponente.ausgewaehltId()).toBe('f-bund');

    komponente.suche.set('gibt-es-nicht');
    fixture.detectChanges();
    expect(komponente.ausgewaehltId()).toBeNull();
    expect(komponente.ausgewaehlt()).toBeNull();
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
    const { liste } = providers([kritisch], {
      ...LEERER_BERICHT,
      zeilen: [berichtZeile({ id: 'f-1', sollKm: 1800, istKm: 100, restKm: 1700 })],
    });
    const konfiguration = konfigurationMock();
    konfiguration.gespeicherteEinstellungen.set({
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
      organisationLandesverband: '',
      organisationRegionalverband: '',
    });
    const mitSchwellen = liste.map((p) =>
      (p as { provide?: unknown }).provide === SystemkonfigurationStoreService
        ? { provide: SystemkonfigurationStoreService, useValue: konfiguration }
        : p,
    );
    const komponente = (await erzeugeUebersicht(mitSchwellen)).componentInstance;

    const zeile = komponente.gefiltert()[0];
    expect(zeile.kmAmpel).toBe('rot');
    expect(zeile.leitTermin.ampel).toBe('warnung');
  });

  it('zeigt höchstens drei offene Termine in der Reihenfolge der Fälligkeit', async () => {
    const fahrzeug = erzeugeTestfahrzeug({
      id: 'f-1',
      wartungstermine: [
        erzeugeTestwartung({ bezeichnung: 'D', faelligAm: versetzeTage(heuteIso(), 40) }),
        erzeugeTestwartung({ bezeichnung: 'A', faelligAm: versetzeTage(heuteIso(), 5) }),
        erzeugeTestwartung({ bezeichnung: 'C', faelligAm: versetzeTage(heuteIso(), 30) }),
        erzeugeTestwartung({ bezeichnung: 'B', faelligAm: versetzeTage(heuteIso(), 10) }),
        erzeugeTestwartung({
          bezeichnung: 'Erledigt',
          faelligAm: versetzeTage(heuteIso(), 1),
          erledigtAm: heuteIso(),
        }),
      ],
    });
    const komponente = (await erzeugeUebersicht(providers([fahrzeug]).liste)).componentInstance;
    expect(komponente.naechsteTermine().map((t) => t.status.termin.bezeichnung)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('verlinkt die Vorschau auf die Fahrzeugakte und bietet keine Formulare an', async () => {
    const fahrzeug = erzeugeTestfahrzeug({ id: 'f-akte', bezeichnung: 'MTW' });
    const fixture = await erzeugeUebersicht(providers([fahrzeug]).liste);
    const element = fixture.nativeElement as HTMLElement;

    const link = element.querySelector<HTMLAnchorElement>('.detail a');
    expect(link?.textContent?.trim()).toBe('Akte öffnen');
    expect(link?.getAttribute('href')).toBe('/fahrzeuge/f-akte');
    expect(element.querySelector('.detail input, .detail textarea, .detail mat-select')).toBeNull();
  });

  it('zeigt den Zustand nicht nur über die Farbe: jeder Chip trägt ein Symbol', async () => {
    const fahrzeug = erzeugeTestfahrzeug({ id: 'f-1' });
    const fixture = await erzeugeUebersicht(providers([fahrzeug]).liste);
    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll('app-ampel-chip');
    expect(chips.length).toBeGreaterThan(0);
    chips.forEach((chip) => expect(chip.querySelector('mat-icon')).not.toBeNull());
  });
});
