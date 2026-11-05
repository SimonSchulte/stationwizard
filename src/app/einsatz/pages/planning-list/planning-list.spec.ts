import { ComponentFixture, TestBed } from '@angular/core/testing';
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
  const gruppen: ReturnType<typeof gruppe>[] = [
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
    // Nur der Titel, ohne den Abstandshinweis in derselben Überschrift.
    return [...wurzel.querySelectorAll('app-einsatz-karte h3')].map((h) =>
      [...h.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('')
        .trim(),
    );
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
    await vergangenWaehlen(fixture);
    expect(kacheln(karte(fixture, 'Altes Fest'))).toEqual([
      'PEP öffnen: Altes Fest',
      'VB anlegen: Altes Fest',
    ]);
    await anstehendWaehlen(fixture);

    expect(kacheln(karte(fixture, 'Weihnachtsmarkt'))).toEqual([
      'PEP öffnen: Weihnachtsmarkt',
      'VB öffnen: Weihnachtsmarkt',
    ]);
    expect(kacheln(karte(fixture, 'Stadtlauf'))).toEqual([
      'PEP anlegen: Stadtlauf',
      'VB anlegen: Stadtlauf',
    ]);
    expect(kacheln(karte(fixture, 'Dienst ohne HiOrg'))).toEqual([
      'PEP anlegen: Dienst ohne HiOrg',
      'VB anlegen: Dienst ohne HiOrg',
    ]);
  });

  function monatsUeberschriften(wurzel: ParentNode): string[] {
    return [...wurzel.querySelectorAll('h2.monat-titel')].map((h) => h.textContent!.trim());
  }

  async function eingabe(fixture: ComponentFixture<PlanningList>, text: string) {
    const feld = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'app-suchfeld input',
    )!;
    feld.value = text;
    feld.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function chip(fixture: ComponentFixture<PlanningList>, text: string): HTMLElement {
    const treffer = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('mat-chip-option'),
    ].find((c) => c.textContent?.includes(text));
    if (!treffer) throw new Error(`Kein Chip „${text}“`);
    return treffer;
  }

  async function chipKlicken(fixture: ComponentFixture<PlanningList>, text: string) {
    chip(fixture, text).querySelector<HTMLElement>('button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function ansichtWaehlen(fixture: ComponentFixture<PlanningList>, index: number) {
    const knoepfe = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'mat-button-toggle button',
    );
    knoepfe[index].click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const anstehendWaehlen = (fixture: ComponentFixture<PlanningList>) => ansichtWaehlen(fixture, 0);
  const vergangenWaehlen = (fixture: ComponentFixture<PlanningList>) => ansichtWaehlen(fixture, 1);

  it('führt HiOrg und eigene Einsätze in einer nach Beginn sortierten Liste', async () => {
    speicher._vorbelegen(
      testEinsatz({ titel: 'Dienst ohne HiOrg', beginn: uebermorgen, ende: uebermorgen }),
    );
    speicher._vorbelegen(testEinsatz({ titel: 'Ohne Datum', beginn: null, ende: null }));
    const fixture = await oeffnen();
    const wurzel: HTMLElement = fixture.nativeElement;
    expect(titelListe(wurzel)).toEqual([
      'Weihnachtsmarkt',
      'Stadtlauf',
      'Dienst ohne HiOrg',
      'Ohne Datum',
    ]);
    // Letzte Gruppe ohne Beginn.
    expect(monatsUeberschriften(wurzel).at(-1)).toBe('Ohne Datum');
    expect(wurzel.querySelector('h2#einsaetze-titel')).toBeNull();
  });

  it('gruppiert nach Monat mit deutscher Überschrift', async () => {
    const fixture = await oeffnen();
    const erwartet = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(
      new Date(kuenftig),
    );
    expect(monatsUeberschriften(fixture.nativeElement)).toContain(erwartet);
  });

  it('zeigt Vergangenes über den Umschalter mit Anzahl, neueste zuerst', async () => {
    speicher._vorbelegen(testEinsatz({ titel: 'Alter Dienst', beginn: gestern, ende: gestern }));
    const fixture = await oeffnen();
    const wurzel: HTMLElement = fixture.nativeElement;
    expect(wurzel.querySelector('mat-expansion-panel')).toBeNull();
    expect(wurzel.querySelector('mat-button-toggle-group')?.textContent).toContain('Vergangen (2)');
    expect(titelListe(wurzel)).not.toContain('Altes Fest');

    await vergangenWaehlen(fixture);
    expect(titelListe(wurzel)).toEqual(['Alter Dienst', 'Altes Fest']);
    // Vergangenes trägt keinen Abstandshinweis.
    expect(wurzel.querySelector('.abstand')).toBeNull();
  });

  it('filtert nach Titel und Ort, Groß-/Kleinschreibung egal', async () => {
    speicher._vorbelegen(
      testEinsatz({ titel: 'Dienst ohne HiOrg', beginn: morgen, ende: morgen, ort: 'Halle' }),
    );
    const fixture = await oeffnen();
    await eingabe(fixture, 'STADT');
    expect(titelListe(fixture.nativeElement)).toEqual(['Stadtlauf']);
    await eingabe(fixture, 'halle');
    expect(titelListe(fixture.nativeElement)).toEqual(['Dienst ohne HiOrg']);
  });

  it('verknüpft die Chips „PEP fehlt“, „VB fehlt“ und „ohne HiOrg“ mit UND', async () => {
    const markt = testEinsatz({ hiorgVeranstaltungId: '4711' });
    speicher._vorbelegen(markt);
    peps._vorbelegen(markt.id, testPep());
    speicher._vorbelegen(testEinsatz({ titel: 'Dienst ohne HiOrg', beginn: morgen, ende: morgen }));
    const fixture = await oeffnen();
    const wurzel: HTMLElement = fixture.nativeElement;

    await chipKlicken(fixture, 'PEP fehlt');
    expect(titelListe(wurzel).sort()).toEqual(['Dienst ohne HiOrg', 'Stadtlauf']);
    await chipKlicken(fixture, 'ohne HiOrg');
    expect(titelListe(wurzel)).toEqual(['Dienst ohne HiOrg']);
    await chipKlicken(fixture, 'PEP fehlt');
    await chipKlicken(fixture, 'ohne HiOrg');
    await chipKlicken(fixture, 'VB fehlt');
    expect(titelListe(wurzel)).toHaveLength(3);
  });

  it('zeigt ohne Treffer einen Leerzustand und setzt Suche und Filter zurück', async () => {
    const fixture = await oeffnen();
    await eingabe(fixture, 'gibt es nicht');
    const wurzel: HTMLElement = fixture.nativeElement;
    expect(wurzel.querySelector('app-leerzustand')?.textContent).toContain(
      'Keine Einsätze passen zu Suche und Filter',
    );
    wurzel.querySelector<HTMLButtonElement>('app-leerzustand button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.suche()).toBe('');
    expect(titelListe(wurzel)).toContain('Weihnachtsmarkt');
  });

  it('zeigt ohne jeden Einsatz den Leerzustand ohne Filterknopf', async () => {
    gruppen.length = 0;
    try {
      const fixture = await oeffnen();
      const wurzel: HTMLElement = fixture.nativeElement;
      expect(wurzel.querySelector('app-leerzustand')?.textContent).toContain(
        'Keine Einsätze gefunden',
      );
      expect(wurzel.querySelector('app-leerzustand button')).toBeNull();
    } finally {
      gruppen.push(
        gruppe('4711', 'Weihnachtsmarkt', kuenftig),
        gruppe('4712', 'Stadtlauf', kuenftig),
        gruppe('4700', 'Altes Fest', frueher),
      );
    }
  });

  it('hat im Kopf Hauptaktion „Einsatz anlegen“ und im Menü Datei öffnen und Einsatz-Vorlagen', async () => {
    const fixture = await oeffnen();
    const wurzel: HTMLElement = fixture.nativeElement;
    const kopf = wurzel.querySelector('app-seitenkopf')!;
    const haupt = kopf.querySelector<HTMLButtonElement>('button[matButton="filled"]');
    expect(haupt?.textContent).toContain('Einsatz anlegen');
    expect(kopf.textContent).not.toContain('Einsatz ohne HiOrg');
    expect(kopf.textContent).not.toContain('Datei öffnen');

    kopf.querySelector<HTMLButtonElement>('button[aria-label="Weitere Aktionen"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const menue = document.querySelector('.mat-mdc-menu-panel')!;
    expect(menue.textContent).toContain('Datei öffnen');
    expect(menue.textContent).toContain('Einsatz-Vorlagen');
    expect(menue.querySelectorAll('[mat-menu-item], .mat-mdc-menu-item')).toHaveLength(2);
  });

  it('zeigt den Abstandshinweis, gelb nur bei ≤ 14 Tagen und fehlendem PEP oder VB', async () => {
    const fixture = await oeffnen();
    const wurzel: HTMLElement = fixture.nativeElement;
    const hinweis = (titel: string) => karte(fixture, titel).querySelector('.abstand');
    expect(hinweis('Weihnachtsmarkt')?.textContent?.trim()).toBe('in 7 Tagen');
    expect(hinweis('Weihnachtsmarkt')?.classList.contains('dringend')).toBe(true);
    expect(wurzel.querySelectorAll('.abstand.dringend').length).toBe(2);
  });

  it('hält einen weit entfernten Einsatz neutral', async () => {
    speicher._vorbelegen(
      testEinsatz({ titel: 'Dienst ohne HiOrg', beginn: uebermorgen, ende: uebermorgen }),
    );
    const fixture = await oeffnen();
    const hinweis = karte(fixture, 'Dienst ohne HiOrg').querySelector('.abstand')!;
    expect(hinweis.textContent?.trim()).toBe('in 30 Tagen');
    expect(hinweis.classList.contains('dringend')).toBe(false);
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
  });

  it('zeigt am VB die Kennzahlen im Untertitel', async () => {
    const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
    speicher._vorbelegen(einsatz);
    vorbereitungen._vorbelegen(einsatz.id, testVorbereitung());
    const fixture = await oeffnen();
    const vb = karte(fixture, 'Weihnachtsmarkt').querySelectorAll('button.kachel')[1];
    expect(vb.textContent).toMatch(/\d+ Laufzettel · \d+ Pos\./);
  });

  it('legt über „Einsatz anlegen“ einen Einsatz an und bleibt in der Liste', async () => {
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
