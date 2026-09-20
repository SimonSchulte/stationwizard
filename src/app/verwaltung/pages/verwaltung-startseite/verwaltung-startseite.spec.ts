import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { VerwaltungStartseite } from './verwaltung-startseite';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import { FahrzeugDruckbogenService } from '../../../fahrzeuge/services/fahrzeug-druckbogen.service';
import { ApiErfassungslinkStorage } from '../../../fahrzeuge/storage/api-erfassungslink-storage';
import type { ErfassungslinkMitFahrzeug } from '../../../fahrzeuge/storage/erfassungslink-storage';

function testlink(
  ueberschreibung: Partial<ErfassungslinkMitFahrzeug> = {},
): ErfassungslinkMitFahrzeug {
  return {
    fahrzeugId: 'f1',
    token: 'a'.repeat(32),
    bezeichnung: 'RTW 1',
    funkrufname: 'Rotkreuz 1/83/1',
    kennzeichen: 'AB-CD 123',
    ...ueberschreibung,
  };
}

function erzeugeSeite(
  darfFreigeben: boolean,
  optionen: {
    links?: ErfassungslinkMitFahrzeug[];
    druckbogen?: () => Promise<void>;
  } = {},
) {
  const benutzerverwaltungStore = {
    listeLaden: vi.fn().mockResolvedValue(undefined),
    darfFreigeben: () => darfFreigeben,
  };
  const linkStorage = {
    ladeLinks: vi.fn(async () => optionen.links ?? [testlink()]),
  };
  const druckbogenService = {
    erzeugeUndSpeichereUebersicht: vi.fn(optionen.druckbogen ?? (async () => {})),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: BenutzerverwaltungStoreService, useValue: benutzerverwaltungStore },
      { provide: ApiErfassungslinkStorage, useValue: linkStorage },
      { provide: FahrzeugDruckbogenService, useValue: druckbogenService },
    ],
  });
  const fixture = TestBed.createComponent(VerwaltungStartseite);
  return { fixture, benutzerverwaltungStore, linkStorage, druckbogenService };
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

  it('blendet die QR-Übersichtsbögen ohne Freigaberecht aus', async () => {
    const { fixture } = erzeugeSeite(false);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button.aufgabe')).toBeNull();
  });

  it('zeigt beide Bogenvarianten und erstellt die öffentliche per Klick', async () => {
    const links = [testlink({ fahrzeugId: 'f1' }), testlink({ fahrzeugId: 'f2' })];
    const { fixture, linkStorage, druckbogenService } = erzeugeSeite(true, { links });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const knoepfe = element.querySelectorAll('button.aufgabe');
    expect(knoepfe).toHaveLength(2);

    (knoepfe[0] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(linkStorage.ladeLinks).toHaveBeenCalledOnce();
    expect(druckbogenService.erzeugeUndSpeichereUebersicht).toHaveBeenCalledWith(
      links,
      'oeffentlich',
    );
    expect(fixture.componentInstance.qrUebersichtFehler()).toBe('');
  });

  it('erstellt über die zweite Kachel den internen Bogen', async () => {
    const { fixture, druckbogenService } = erzeugeSeite(true);
    await fixture.componentInstance.qrUebersichtErstellen('intern');
    expect(druckbogenService.erzeugeUndSpeichereUebersicht).toHaveBeenCalledWith(
      [testlink()],
      'intern',
    );
  });

  it('meldet einen Fehler statt zu erstellen, wenn keine Fahrzeuge erreichbar sind', async () => {
    // Auch der Fall "Rolle reicht für kein Fahrzeug": der Worker liefert dann
    // eine leere Liste statt einer Abweisung.
    const { fixture, druckbogenService } = erzeugeSeite(true, { links: [] });
    await fixture.componentInstance.qrUebersichtErstellen('oeffentlich');
    expect(druckbogenService.erzeugeUndSpeichereUebersicht).not.toHaveBeenCalled();
    expect(fixture.componentInstance.qrUebersichtFehler()).toBe(
      'Es sind keine Fahrzeuge vorhanden, für die du freigeben darfst.',
    );
  });

  it('meldet einen Fehler aus dem Druckbogendienst', async () => {
    const { fixture } = erzeugeSeite(true, {
      druckbogen: async () => {
        throw new Error('PDF fehlgeschlagen');
      },
    });
    await fixture.componentInstance.qrUebersichtErstellen('oeffentlich');
    expect(fixture.componentInstance.qrUebersichtFehler()).toBe('PDF fehlgeschlagen');
  });
});
