import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningList } from './planning-list';
import { EfsApiService, EfsDetailResult } from '../../services/efs-api.service';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PepEditorKontext } from '../../services/pep-editor-kontext';
import { SaveLoadService } from '../../services/save-load.service';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { erzeugeTestplanung } from '../../services/testing/pep-testdaten';
import { EinsatzAktionenDienst } from '../../services/einsatz-aktionen';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import {
  InMemoryEinsatzStorage,
  InMemoryPepStorage,
  InMemoryVorbereitungStorage,
} from '../../testing/in-memory-einsatzplanung';
import { lokaleZeitText } from '../../services/einsatz-anzeige';
import { testPep } from '../../testing/pep-testdaten';
import { testEinsatz, testVorbereitung } from '../../testing/vb-testdaten';

function routeMit(abfrage: Record<string, string> = {}) {
  return {
    provide: ActivatedRoute,
    useValue: { snapshot: { queryParamMap: convertToParamMap(abfrage) } },
  };
}

describe('Datei öffnen', () => {
  it('öffnet die Datei ohne Einsatzbezug im Editor und verwirft einen alten Speicherort', async () => {
    const navigate = vi.fn().mockResolvedValue(true);
    const planung = erzeugeTestplanung();
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: { fehler: signal('') } },
        { provide: Router, useValue: { navigate } },
        {
          provide: SaveLoadService,
          useValue: { load: vi.fn().mockResolvedValue({ planung, versionWarning: false }) },
        },
        routeMit(),
      ],
    });
    const store = TestBed.inject(PlanungStoreService);
    const kontext = TestBed.inject(PepEditorKontext);
    kontext.setzen({ art: 'vorlage', vorlageId: crypto.randomUUID(), version: null });
    const liste = TestBed.runInInjectionContext(() => new PlanningList());

    await liste.loadFromFile();

    expect(kontext.ziel()).toBeNull();
    expect(store.active()).toEqual(planung);
    // Unverändert gegenüber der Datei: keine Rückfrage beim Verlassen.
    expect(store.hatUngesichertes()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/editor']);
  });

  it('warnt vor einer Versionswarnung der Datei, öffnet sie aber trotzdem', async () => {
    const hinweis = vi.fn().mockResolvedValue(undefined);
    const planung = erzeugeTestplanung();
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: { fehler: signal('') } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: DialogDienst, useValue: { hinweis } },
        {
          provide: SaveLoadService,
          useValue: { load: vi.fn().mockResolvedValue({ planung, versionWarning: true }) },
        },
        routeMit(),
      ],
    });
    const liste = TestBed.runInInjectionContext(() => new PlanningList());
    await liste.loadFromFile();
    expect(hinweis).toHaveBeenCalled();
    expect(TestBed.inject(PlanungStoreService).active()).toEqual(planung);
  });
});

describe('Rückkehr von der HiOrg-Anmeldung', () => {
  function listeMit(abfrage: Record<string, string>) {
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: { fehler: signal(''), getVeranstaltungen: vi.fn() } },
        { provide: Router, useValue: { navigate } },
        { provide: ApiEinsatzStorage, useValue: new InMemoryEinsatzStorage() },
        routeMit(abfrage),
      ],
    });
    const liste = TestBed.runInInjectionContext(() => new PlanningList());
    liste.ngOnInit();
    return { liste, navigate };
  }

  it('meldet eine hergestellte Verbindung und entfernt den Parameter aus der Adresse', () => {
    const { liste, navigate } = listeMit({ hiorg: 'verbunden' });
    expect(liste.hiorgVerbunden()).toBe(true);
    expect(liste.hiorgRueckmeldung()).toContain('hergestellt');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { hiorg: null }, replaceUrl: true }),
    );
  });

  it('zeigt für einen unbekannten Wert nur den festen Fehlertext, nie den Parameter selbst', () => {
    const { liste } = listeMit({ hiorg: '<b>erfunden</b>' });
    expect(liste.hiorgVerbunden()).toBe(false);
    expect(liste.hiorgRueckmeldung()).not.toContain('erfunden');
    expect(liste.hiorgRueckmeldung()).toContain('nicht hergestellt');
  });
});

describe('Einsatzübersicht: PEP und VB je Zeile', () => {
  beforeAll(() => registerLocaleData(localeDe, 'de-DE'));

  const kuenftig = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const frueher = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const gruppe = (id: string, titel: string, bis: string) => ({
    veranstaltung_id: id,
    titel,
    datum_von: bis,
    datum_bis: bis,
    ort: 'Ummeln',
    schichten: [],
  });
  const gruppen = [
    gruppe('4711', 'Weihnachtsmarkt', kuenftig),
    gruppe('4712', 'Stadtlauf', kuenftig),
    gruppe('4700', 'Altes Fest', frueher),
  ];
  const tag = (offset: number) => lokaleZeitText(new Date(Date.now() + offset * 24 * 3600 * 1000));
  const gestern = tag(-1);
  const morgen = tag(1);
  const uebermorgen = tag(30);
  const aktionen = {
    laufend: signal<string | null>(null),
    pepOeffnenOderAnlegen: vi.fn().mockResolvedValue(undefined),
    vbOeffnenOderAnlegen: vi.fn().mockResolvedValue(undefined),
  };
  let speicher: InMemoryEinsatzStorage;
  let vorbereitungen: InMemoryVorbereitungStorage;
  let peps: InMemoryPepStorage;
  let navigate: ReturnType<typeof vi.fn>;
  let dialogAntwort: unknown;

  async function oeffnen() {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EfsApiService,
          useValue: {
            fehler: signal(''),
            erreichbar: signal(true),
            getVeranstaltungen: vi.fn().mockResolvedValue([]),
            groupEinsaetze: () => gruppen,
          },
        },
        { provide: Router, useValue: { navigate } },
        { provide: ApiEinsatzStorage, useValue: speicher },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => of(dialogAntwort) }) },
        },
        { provide: EinsatzAktionenDienst, useValue: aktionen },
        routeMit(),
      ],
    });
    const fixture = TestBed.createComponent(PlanningList);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function karte(fixture: { nativeElement: HTMLElement }, titel: string): HTMLElement {
    const treffer = [
      ...fixture.nativeElement.querySelectorAll<HTMLElement>('app-einsatz-karte'),
    ].find((z) => z.querySelector('h3')?.textContent?.includes(titel));
    if (!treffer) throw new Error(`Keine Karte „${titel}“`);
    return treffer;
  }

  function titelListe(wurzel: ParentNode): string[] {
    return [...wurzel.querySelectorAll('app-einsatz-karte h3')].map((h) => h.textContent!.trim());
  }

  /** Beschriftungen der Kacheln einer Karte (aria-label). */
  function kacheln(z: HTMLElement): string[] {
    return [...z.querySelectorAll('button.kachel')].map((k) => k.getAttribute('aria-label')!);
  }

  beforeEach(() => {
    vorbereitungen = new InMemoryVorbereitungStorage();
    peps = new InMemoryPepStorage();
    speicher = new InMemoryEinsatzStorage(vorbereitungen, peps);
    navigate = vi.fn().mockResolvedValue(true);
    dialogAntwort = undefined;
    aktionen.laufend.set(null);
    aktionen.pepOeffnenOderAnlegen.mockClear();
    aktionen.vbOeffnenOderAnlegen.mockClear();
  });

  it('beschriftet die Kacheln je Stand: anlegen ohne Einsatz, öffnen mit PEP und VB', async () => {
    const mitBeidem = testEinsatz({ hiorgVeranstaltungId: '4711' });
    speicher._vorbelegen(mitBeidem);
    peps._vorbelegen(mitBeidem.id, testPep());
    vorbereitungen._vorbelegen(mitBeidem.id, testVorbereitung());
    const nurPep = testEinsatz({ hiorgVeranstaltungId: '4700' });
    speicher._vorbelegen(nurPep);
    peps._vorbelegen(nurPep.id, testPep());
    speicher._vorbelegen(testEinsatz({ titel: 'Dienst ohne HiOrg', beginn: morgen, ende: morgen }));
    const fixture = await oeffnen();

    expect(kacheln(karte(fixture, 'Weihnachtsmarkt'))).toEqual([
      'PEP öffnen: Weihnachtsmarkt',
      'VB öffnen: Weihnachtsmarkt',
    ]);
    expect(kacheln(karte(fixture, 'Stadtlauf'))).toEqual([
      'PEP anlegen: Stadtlauf',
      'VB anlegen: Stadtlauf',
    ]);
    expect(kacheln(karte(fixture, 'Altes Fest'))).toEqual([
      'PEP öffnen: Altes Fest',
      'VB anlegen: Altes Fest',
    ]);
    expect(kacheln(karte(fixture, 'Dienst ohne HiOrg'))).toEqual([
      'PEP anlegen: Dienst ohne HiOrg',
      'VB anlegen: Dienst ohne HiOrg',
    ]);
  });

  it('führt HiOrg und eigene Einsätze in einer nach Beginn sortierten Liste', async () => {
    speicher._vorbelegen(
      testEinsatz({ titel: 'Dienst ohne HiOrg', beginn: uebermorgen, ende: uebermorgen }),
    );
    speicher._vorbelegen(testEinsatz({ titel: 'Ohne Datum', beginn: null, ende: null }));
    const fixture = await oeffnen();
    const wurzel: HTMLElement = fixture.nativeElement;
    const anstehend = wurzel.querySelector('ul.karten')!;
    expect(titelListe(anstehend)).toEqual([
      'Weihnachtsmarkt',
      'Stadtlauf',
      'Dienst ohne HiOrg',
      'Ohne Datum',
    ]);
    expect(wurzel.querySelector('h2#einsaetze-titel')?.textContent).toContain(
      'Anstehende Einsätze',
    );
  });

  it('legt Vergangenes in ein zugeklapptes Panel mit Anzahl im Titel', async () => {
    speicher._vorbelegen(testEinsatz({ titel: 'Alter Dienst', beginn: gestern, ende: gestern }));
    const fixture = await oeffnen();
    const wurzel: HTMLElement = fixture.nativeElement;
    const panel = wurzel.querySelector('mat-expansion-panel')!;
    expect(panel.textContent).toContain('Vergangene Einsätze (2)');
    expect(panel.classList.contains('mat-expanded')).toBe(false);
    expect(titelListe(panel).sort()).toEqual(['Alter Dienst', 'Altes Fest']);
    expect(titelListe(wurzel.querySelector('ul.karten')!)).not.toContain('Altes Fest');
  });

  it('übergibt Veranstaltung bzw. Einsatz an den Aktionsdienst', async () => {
    const ohne = testEinsatz({ titel: 'Dienst ohne HiOrg', beginn: morgen, ende: morgen });
    speicher._vorbelegen(ohne);
    const fixture = await oeffnen();

    const markt = karte(fixture, 'Weihnachtsmarkt').querySelectorAll<HTMLButtonElement>('button');
    markt[0].click();
    markt[1].click();
    expect(aktionen.pepOeffnenOderAnlegen).toHaveBeenCalledWith(gruppen[0]);
    expect(aktionen.vbOeffnenOderAnlegen).toHaveBeenCalledWith(gruppen[0]);

    karte(fixture, 'Dienst ohne HiOrg').querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(aktionen.vbOeffnenOderAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: ohne.id }),
    );
  });

  it('springt beim Klick auf die Karte nicht auf eine Einsatzseite', async () => {
    const fixture = await oeffnen();
    karte(fixture, 'Weihnachtsmarkt').click();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sperrt alle Kacheln, solange eine Aktion läuft', async () => {
    const fixture = await oeffnen();
    aktionen.laufend.set('hiorg:4711');
    fixture.detectChanges();
    const wurzel: HTMLElement = fixture.nativeElement;
    const alle = [...wurzel.querySelectorAll<HTMLButtonElement>('app-einsatz-karte button.kachel')];
    expect(alle.length).toBeGreaterThan(0);
    expect(alle.every((k) => k.disabled)).toBe(true);
  });

  it('zeigt an der PEP-Kachel „n / m besetzt“ und ohne PEP „nicht angelegt“', async () => {
    const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
    speicher._vorbelegen(einsatz);
    peps._vorbelegen(einsatz.id, testPep());
    const fixture = await oeffnen();
    const pep = karte(fixture, 'Weihnachtsmarkt').querySelectorAll('button.kachel')[0];
    expect(pep.textContent?.replace(/\s+/g, ' ')).toContain('1 / 2 besetzt');
    const ohne = karte(fixture, 'Stadtlauf').querySelectorAll('button.kachel')[0];
    expect(ohne.textContent).toContain('nicht angelegt');
  });

  it('hat keine Nextcloud-, Lokale-Planungen- und Neue-Planung-Elemente mehr', async () => {
    const fixture = await oeffnen();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Nextcloud');
    expect(text).not.toContain('Gespeicherte Einsatzpläne');
    expect(text).not.toContain('Lokale Planungen');
    expect(text).not.toContain('Neue Planung');
    expect(text).toContain('Datei öffnen');
  });

  it('zeigt am VB die Kennzahlen im Untertitel', async () => {
    const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
    speicher._vorbelegen(einsatz);
    vorbereitungen._vorbelegen(einsatz.id, testVorbereitung());
    const fixture = await oeffnen();
    const vb = karte(fixture, 'Weihnachtsmarkt').querySelectorAll('button.kachel')[1];
    expect(vb.textContent).toMatch(/\d+ Laufzettel · \d+ Pos\./);
  });

  it('legt „Einsatz ohne HiOrg“ an und bleibt in der Liste', async () => {
    dialogAntwort = { titel: 'Neuer Dienst', beginn: null, ende: null, ort: null };
    const fixture = await oeffnen();
    await fixture.componentInstance.einsatzAnlegen();
    fixture.detectChanges();

    expect((await speicher.ladeEinsaetze()).map((e) => e.titel)).toEqual(['Neuer Dienst']);
    expect(navigate).not.toHaveBeenCalled();
    expect(kacheln(karte(fixture, 'Neuer Dienst'))).toEqual([
      'PEP anlegen: Neuer Dienst',
      'VB anlegen: Neuer Dienst',
    ]);
  });
});
