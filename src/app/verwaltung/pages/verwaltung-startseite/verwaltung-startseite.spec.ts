import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { VerwaltungStartseite } from './verwaltung-startseite';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import { FahrzeugDruckbogenService } from '../../../fahrzeuge/services/fahrzeug-druckbogen.service';
import { FahrzeugStoreService } from '../../../fahrzeuge/services/fahrzeug-store.service';
import { Fahrzeugstamm, GRUPPE_STANDARD } from '../../../fahrzeuge/models/fahrzeug.model';

function testfahrzeug(ueberschreibung: Partial<Fahrzeugstamm> = {}): Fahrzeugstamm {
  return {
    id: 'f1',
    bezeichnung: 'RTW 1',
    funkrufname: 'Rotkreuz 1/83/1',
    kennzeichen: 'AB-CD 123',
    fahrgestellnummer: null,
    eigentuemer: 'organisation',
    gruppe: GRUPPE_STANDARD,
    bemerkung: '',
    wartungstermine: [],
    geaendertAm: '2026-01-01T00:00:00.000Z',
    geaendertVon: '',
    ...ueberschreibung,
  };
}

function erzeugeSeite(
  istZugfuehrung: boolean,
  optionen: {
    fahrzeuge?: Fahrzeugstamm[];
    druckbogen?: (fahrzeuge: readonly Fahrzeugstamm[]) => Promise<void>;
  } = {},
) {
  const benutzerverwaltungStore = {
    listeLaden: vi.fn().mockResolvedValue(undefined),
    istZugfuehrung: () => istZugfuehrung,
  };
  const fahrzeugStore = {
    listeLaden: vi.fn().mockResolvedValue(undefined),
    fahrzeuge: () => optionen.fahrzeuge ?? [testfahrzeug()],
  };
  const druckbogenService = {
    erzeugeUndSpeichereUebersicht: vi.fn(optionen.druckbogen ?? (async () => {})),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: BenutzerverwaltungStoreService, useValue: benutzerverwaltungStore },
      { provide: FahrzeugStoreService, useValue: fahrzeugStore },
      { provide: FahrzeugDruckbogenService, useValue: druckbogenService },
    ],
  });
  const fixture = TestBed.createComponent(VerwaltungStartseite);
  return { fixture, benutzerverwaltungStore, fahrzeugStore, druckbogenService };
}

describe('Verwaltungs-Startseite', () => {
  it('verweist auf den Fahrzeugimport', async () => {
    const { fixture } = erzeugeSeite(false);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const verweise = Array.from(element.querySelectorAll('a.aufgabe'));
    expect(verweise.map((verweis) => verweis.getAttribute('href'))).toContain(
      '/verwaltung/fahrzeuge-import',
    );
  });

  it('blendet den QR-Übersichtsbogen ohne die Rolle Zugführung aus', async () => {
    const { fixture } = erzeugeSeite(false);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button.aufgabe')).toBeNull();
  });

  it('zeigt den QR-Übersichtsbogen für die Zugführung und erstellt ihn per Klick', async () => {
    const fahrzeuge = [testfahrzeug({ id: 'f1' }), testfahrzeug({ id: 'f2' })];
    const { fixture, fahrzeugStore, druckbogenService } = erzeugeSeite(true, { fahrzeuge });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const knopf = element.querySelector('button.aufgabe') as HTMLButtonElement;
    expect(knopf).not.toBeNull();

    knopf.click();
    await fixture.whenStable();

    expect(fahrzeugStore.listeLaden).toHaveBeenCalledOnce();
    expect(druckbogenService.erzeugeUndSpeichereUebersicht).toHaveBeenCalledWith(fahrzeuge);
    expect(fixture.componentInstance.qrUebersichtFehler()).toBe('');
  });

  it('meldet einen Fehler statt zu erstellen, wenn keine Fahrzeuge vorhanden sind', async () => {
    const { fixture, druckbogenService } = erzeugeSeite(true, { fahrzeuge: [] });
    await fixture.componentInstance.qrUebersichtErstellen();
    expect(druckbogenService.erzeugeUndSpeichereUebersicht).not.toHaveBeenCalled();
    expect(fixture.componentInstance.qrUebersichtFehler()).toBe(
      'Es sind keine Fahrzeuge vorhanden.',
    );
  });

  it('meldet einen Fehler aus dem Druckbogendienst', async () => {
    const { fixture } = erzeugeSeite(true, {
      druckbogen: async () => {
        throw new Error('PDF fehlgeschlagen');
      },
    });
    await fixture.componentInstance.qrUebersichtErstellen();
    expect(fixture.componentInstance.qrUebersichtFehler()).toBe('PDF fehlgeschlagen');
  });
});
