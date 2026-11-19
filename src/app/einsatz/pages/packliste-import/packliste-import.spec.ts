import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { PacklisteLeser } from '../../services/packliste-excel';
import { PacklisteZeile } from '../../services/packliste-import';
import { ApiAufbauVorlagenStorage } from '../../storage/api-aufbau-storage';
import { ApiStammdatenStorage } from '../../storage/api-stammdaten-storage';
import { InMemoryAufbauVorlagenStorage } from '../../testing/in-memory-aufbau';
import { InMemoryStammdatenStorage } from '../../testing/in-memory-stammdaten-storage';
import { PacklisteImport } from './packliste-import';

const zeilen: PacklisteZeile[] = [
  {
    zeile: 2,
    anzahl: 2,
    material: 'Kabeltrommel',
    lagerort: 'Technik',
    lagerplatz: 'Regal',
    transportMit: 'Rollwagen',
  },
  {
    zeile: 3,
    anzahl: 1,
    material: 'Rollwagen',
    lagerort: '',
    lagerplatz: '',
    transportMit: 'GW Test',
  },
  {
    zeile: 4,
    anzahl: 1,
    material: 'Kiste "Hygiene"',
    lagerort: 'Technik',
    lagerplatz: '',
    transportMit: 'GW Test',
  },
];

describe('PacklisteImport', () => {
  let stammdaten: InMemoryStammdatenStorage;
  let vorlagen: InMemoryAufbauVorlagenStorage;
  let meldungen: { erfolg: ReturnType<typeof vi.fn>; fehler: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stammdaten = new InMemoryStammdatenStorage();
    vorlagen = new InMemoryAufbauVorlagenStorage();
    meldungen = { erfolg: vi.fn(), fehler: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiStammdatenStorage, useValue: stammdaten },
        { provide: ApiAufbauVorlagenStorage, useValue: vorlagen },
        { provide: MeldungsDienst, useValue: meldungen },
        { provide: PacklisteLeser, useValue: { lesen: async () => zeilen } },
      ],
    });
  });

  async function dateiWaehlen() {
    const fixture = TestBed.createComponent(PacklisteImport);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const feld = element.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(feld, 'files', {
      value: [new File(['x'], 'Packliste Test.xlsx')],
      configurable: true,
    });
    feld.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element };
  }

  it('zeigt nach dem Lesen Zahlen, Lager und den Namen der Datei als Vorschlag für die Vorlage', async () => {
    const { element } = await dateiWaehlen();
    expect(element.querySelector('.zahlen')?.textContent).toContain('1 Fahrzeuge');
    expect(element.querySelector('.zahlen')?.textContent).toContain('1 Wagen');
    expect(element.querySelector('.zuordnung')?.textContent).toContain('Technik');
    expect(element.querySelector('.zuordnung')?.textContent).toContain('Regal');
    expect(element.querySelector<HTMLInputElement>('.titel input')?.value).toBe('Packliste Test');
  });

  it('legt Lager, Plätze und die Aufbau-Vorlage an und öffnet die Vorlage', async () => {
    const router = TestBed.inject(Router);
    const navigieren = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const { fixture, element } = await dateiWaehlen();
    element.querySelector('form.anlegen')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    const lager = await stammdaten.ladeLager();
    expect(lager.map((l) => [l.name, l.plaetze.map((p) => p.name)])).toEqual([
      ['Technik', ['Regal']],
    ]);
    const liste = await vorlagen.ladeVorlagen();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ titel: 'Packliste Test', einheiten: 2, kisten: 1 });
    const gespeichert = await vorlagen.ladeVorlage(liste[0]!.id);
    const trommel = JSON.stringify(gespeichert?.daten.inhalt);
    expect(trommel).toContain(`"platzId":"${lager[0]!.plaetze[0]!.id}"`);
    expect(navigieren).toHaveBeenCalledWith(['/einsatzplanung/aufbau-vorlagen', liste[0]!.id]);
    expect(meldungen.fehler).not.toHaveBeenCalled();
  });

  it('ordnet Lagerort und Artikel dem Bestand zu', async () => {
    const lagerId = '00000000-0000-4000-8000-000000000001';
    const artikelId = '00000000-0000-4000-8000-000000000002';
    await stammdaten.speichereLager({ id: lagerId, name: 'Werkstatt', plaetze: [] }, null);
    await stammdaten.speichereArtikel(
      { id: artikelId, name: 'Kabeltrommel 50 m', einheit: 'Stück', lagerId },
      null,
    );
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const { fixture, element } = await dateiWaehlen();
    const komponente = fixture.componentInstance as unknown as {
      lagerGewaehlt(schluessel: string, id: string): void;
      artikelGewaehlt(zeile: number, id: string | null): void;
    };
    komponente.lagerGewaehlt('technik', lagerId);
    komponente.artikelGewaehlt(2, artikelId);
    fixture.detectChanges();
    element.querySelector('form.anlegen')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    const lager = await stammdaten.ladeLager();
    expect(lager.map((l) => [l.name, l.plaetze.map((p) => p.name)])).toEqual([
      ['Werkstatt', ['Regal']],
    ]);
    const liste = await vorlagen.ladeVorlagen();
    const gespeichert = JSON.stringify((await vorlagen.ladeVorlage(liste[0]!.id))?.daten.inhalt);
    expect(gespeichert).toContain(`"art":"artikel","id"`);
    expect(gespeichert).toContain(`"artikelId":"${artikelId}"`);
    expect(gespeichert).not.toContain('"name":"Kabeltrommel"');
    expect(gespeichert).toContain(`"lagerId":"${lagerId}"`);
  });
});
