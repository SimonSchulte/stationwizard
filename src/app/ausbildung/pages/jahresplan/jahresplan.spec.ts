import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { PlanStore } from '../../services/plan-store';
import { DatenbankZustand, KalenderDatenService } from '../../services/kalender-daten.service';
import { FeiertagService } from '../../services/feiertage.service';
import { HiorgKalenderService } from '../../services/hiorg-kalender.service';
import type { HiorgEintrag } from '../../models/hiorg-kalender.model';
import { Jahresplan } from './jahresplan';
import { wochentageImJahr } from '../../../kern/kalender/datum';
import { leererTermin, leeresDocument } from '../../models/plan.model';
import { KalenderKonfliktFehler } from '../../storage/kalender-storage';

/** Ersatz für die Kalender-Datenbank: verbunden, ohne echten Abruf. */
function kalenderAttrappe(jahre: number[] = [2026]) {
  return {
    zustand: signal<DatenbankZustand>('verbunden'),
    fehler: signal(''),
    beschaeftigt: signal(false),
    istLeer: signal(false),
    verfuegbareJahre: signal<number[]>(jahre),
    laden: vi.fn().mockResolvedValue({ meldungen: [] }),
    speichern: vi.fn().mockResolvedValue({ geschrieben: 1 }),
    exportieren: vi.fn(),
    waehleJahr: vi.fn(),
    neuesJahr: vi.fn(),
  };
}

const HIORG_EINTRAG: HiorgEintrag = {
  schluessel: 'test|2026-05-04|Erfundene Ausbildung',
  beginn: '2026-05-04',
  ende: '2026-05-04',
  beginnZeit: '19:30',
  endeZeit: '21:30',
  name: 'Erfundene Ausbildung Verpflegung',
  art: 'termin',
  url: 'https://www.hiorg-server.de/formulare.php?ri=1000001',
  id: '1000001',
};

describe('Bestätigungen im Ausbildungsplan', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const kalender = kalenderAttrappe([2026]);
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal('geladen'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    lade: vi.fn(),
  };
  let ansicht: Jahresplan;
  let store: PlanStore;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogDienst, useValue: dialog },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: KalenderDatenService, useValue: kalender },
        {
          provide: FeiertagService,
          useValue: { bundesland: signal('NW'), feiertage: signal(new Map()), lade: vi.fn() },
        },
        { provide: HiorgKalenderService, useValue: hiorg },
      ],
    });
    hiorg.eintraege.set([]);
    store = TestBed.inject(PlanStore);
    store.ungespeichert.set(true);
    ansicht = TestBed.runInInjectionContext(() => new Jahresplan());
  });

  it('behält ungespeicherte Daten bei abgebrochener Neuladebestätigung', async () => {
    dialog.bestaetigen.mockResolvedValue(false);
    await ansicht.neuLaden();
    expect(kalender.laden).not.toHaveBeenCalled();
    expect(store.ungespeichert()).toBe(true);
  });

  it('verwirft keine Änderung, die während der Bestätigung eingetroffen ist', async () => {
    let bestaetigen!: (entscheidung: boolean) => void;
    dialog.bestaetigen.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          bestaetigen = resolve;
        }),
    );
    const neuLaden = ansicht.neuLaden();
    const inzwischen = leeresDocument();
    store.setzeDokument(inzwischen);
    bestaetigen(true);
    await neuLaden;
    expect(kalender.laden).not.toHaveBeenCalled();
    expect(store.dokument()).toBe(inzwischen);
    expect(dialog.hinweis).toHaveBeenCalled();
  });

  it('zeigt einen HiOrg-Termin ohne Plangegenstück als Lücke', () => {
    store.setzeDokument({ ...leeresDocument(2026), termine: [] });
    hiorg.eintraege.set([HIORG_EINTRAG]);

    const tag = ansicht.hiorgTag('2026-05-04');

    expect(tag?.eintraege).toHaveLength(1);
    expect(tag?.ohneGegenstueck).toHaveLength(1);
    expect(ansicht.hiorgAbgleich().anzahlAbweichungen).toBe(0);
  });

  it('blendet die HiOrg-Karte bei exaktem Treffer aus, da die Termin-Karte ihn schon zeigt', () => {
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [{ ...leererTermin('2026-05-04'), id: 't1', thema: HIORG_EINTRAG.name }],
    });
    hiorg.eintraege.set([HIORG_EINTRAG]);

    const tag = ansicht.hiorgTag('2026-05-04')!;

    expect(ansicht.hiorgTreffer('t1')).toEqual(HIORG_EINTRAG);
    expect(ansicht.istBereitsAufTerminKarte(tag, HIORG_EINTRAG)).toBe(true);
  });

  it('warnt, wenn der Plan an diesem Tag anders heißt', () => {
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [
        { ...leererTermin('2026-05-04'), id: 't1', thema: 'Anderes Thema', beginnZeit: '19:30' },
      ],
    });
    hiorg.eintraege.set([HIORG_EINTRAG]);

    expect(ansicht.hiorgAbgleich().anzahlAbweichungen).toBe(1);
    expect(ansicht.hiorgAbgleich().tageMitAbweichung.has('2026-05-04')).toBe(true);
  });

  it('übernimmt den HiOrg-Namen nach Bestätigung in den Plan', async () => {
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [
        { ...leererTermin('2026-05-04'), id: 't1', thema: 'Anderes Thema', beginnZeit: '19:30' },
      ],
    });
    hiorg.eintraege.set([HIORG_EINTRAG]);
    dialog.bestaetigen.mockResolvedValue(true);

    const [abweichung] = ansicht.hiorgAbgleich().nachDatum.get('2026-05-04')!.abweichungen;
    await ansicht.uebernimmHiorgNamen(abweichung!);

    expect(store.terminNachId('t1')?.thema).toBe(HIORG_EINTRAG.name);
    expect(store.ungespeichert()).toBe(true);
    expect(store.kannRueckgaengig()).toBe(true);
  });

  it('lässt den Plan unberührt, wenn die Übernahme abgebrochen wird', async () => {
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [
        { ...leererTermin('2026-05-04'), id: 't1', thema: 'Anderes Thema', beginnZeit: '19:30' },
      ],
    });
    hiorg.eintraege.set([HIORG_EINTRAG]);
    dialog.bestaetigen.mockResolvedValue(false);

    const [abweichung] = ansicht.hiorgAbgleich().nachDatum.get('2026-05-04')!.abweichungen;
    await ansicht.uebernimmHiorgNamen(abweichung!);

    expect(store.terminNachId('t1')?.thema).toBe('Anderes Thema');
  });
});

describe('Monatsfilter im Jahresplan', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const heute = new Date();
  const aktuellesJahr = heute.getFullYear();
  const aktuellerMonat = heute.getMonth();
  const kalender = kalenderAttrappe([aktuellesJahr]);
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal('geladen'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    lade: vi.fn(),
  };
  let ansicht: Jahresplan;
  let store: PlanStore;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogDienst, useValue: dialog },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: KalenderDatenService, useValue: kalender },
        {
          provide: FeiertagService,
          useValue: { bundesland: signal('NW'), feiertage: signal(new Map()), lade: vi.fn() },
        },
        { provide: HiorgKalenderService, useValue: hiorg },
      ],
    });
    store = TestBed.inject(PlanStore);
    store.setzeDokument(leeresDocument(aktuellesJahr));
    ansicht = TestBed.runInInjectionContext(() => new Jahresplan());
  });

  it('startet im laufenden Monat', () => {
    expect(ansicht.monat()).toBe(aktuellerMonat);
    expect(ansicht.imAktuellenMonat()).toBe(true);
  });

  it('zeigt nur Wochen, die den gewählten Monat berühren', () => {
    ansicht.waehleMonat(2);
    const monate = new Set(
      ansicht
        .sichtbareWochen()
        .flatMap((w) => w.tage)
        .filter((t) => t.imJahr)
        .map((t) => Number(t.datum.slice(5, 7)) - 1),
    );

    // Randwochen ragen bewusst in den Nachbarmonat, mehr aber nicht.
    expect(monate.has(2)).toBe(true);
    expect([...monate].every((m) => m >= 1 && m <= 3)).toBe(true);
    expect(ansicht.sichtbareWochen().length).toBeLessThan(10);
  });

  it('hebt den Monatsfilter für eine Suche auf, damit kein Treffer verborgen bleibt', () => {
    const dezember = `${aktuellesJahr}-12-07`;
    store.setzeDokument({
      ...leeresDocument(aktuellesJahr),
      termine: [{ ...leererTermin(dezember), id: 't1', thema: 'Erfundene Winterausbildung' }],
    });
    ansicht.waehleMonat(2);

    expect(ansicht.sichtbareWochen().some((w) => w.tage.some((t) => t.datum === dezember))).toBe(
      false,
    );

    ansicht.suche.set('Winterausbildung');

    expect(ansicht.sichtbareWochen().some((w) => w.tage.some((t) => t.datum === dezember))).toBe(
      true,
    );
  });

  it('kehrt über „Aktueller Monat" zurück und zeigt bei „Ganzes Jahr" alle Wochen', () => {
    ansicht.waehleMonat(null);
    expect(ansicht.sichtbareWochen().length).toBeGreaterThan(50);
    expect(ansicht.imAktuellenMonat()).toBe(false);

    ansicht.zumAktuellenMonat();

    expect(ansicht.monat()).toBe(aktuellerMonat);
    expect(ansicht.imAktuellenMonat()).toBe(true);
  });

  it('begrenzt die Monatsschritte auf das Jahr', () => {
    ansicht.waehleMonat(0);
    ansicht.verschiebeMonat(-1);
    expect(ansicht.monat()).toBe(0);

    ansicht.waehleMonat(11);
    ansicht.verschiebeMonat(1);
    expect(ansicht.monat()).toBe(11);
  });
});

describe('HiOrg-Statuschip', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const kalender = kalenderAttrappe([2026]);
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal<'ungeprueft' | 'geladen' | 'nicht-konfiguriert' | 'fehler'>('ungeprueft'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    lade: vi.fn(),
  };
  let ansicht: Jahresplan;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogDienst, useValue: dialog },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: KalenderDatenService, useValue: kalender },
        {
          provide: FeiertagService,
          useValue: { bundesland: signal('NW'), feiertage: signal(new Map()), lade: vi.fn() },
        },
        { provide: HiorgKalenderService, useValue: hiorg },
      ],
    });
    hiorg.eintraege.set([]);
    hiorg.laedt.set(false);
    hiorg.fehler.set('');
    hiorg.zustand.set('ungeprueft');
    ansicht = TestBed.runInInjectionContext(() => new Jahresplan());
  });

  it('zeigt den Ladezustand, solange ein Abruf läuft', () => {
    hiorg.laedt.set(true);

    expect(ansicht.hiorgStatus().icon).toBe('cloud_sync');
  });

  it('zeigt die Anzahl geladener Termine im Tooltip des verbundenen Zustands', () => {
    hiorg.zustand.set('geladen');
    hiorg.eintraege.set([HIORG_EINTRAG, HIORG_EINTRAG]);

    expect(ansicht.hiorgStatus()).toMatchObject({ icon: 'cloud_done', text: 'HiOrg verbunden' });
    expect(ansicht.hiorgStatus().tooltip).toContain('2 Termine');
  });

  it('zeigt, wenn der Feed nicht eingerichtet ist', () => {
    hiorg.zustand.set('nicht-konfiguriert');

    expect(ansicht.hiorgStatus()).toMatchObject({
      icon: 'cloud_off',
      text: 'HiOrg nicht eingerichtet',
    });
  });

  it('zeigt einen Fehler mit der Fehlermeldung als Tooltip', () => {
    hiorg.zustand.set('fehler');
    hiorg.fehler.set('Erfundener Verbindungsfehler');

    const status = ansicht.hiorgStatus();
    expect(status.icon).toBe('cloud_alert');
    expect(status.tooltip).toBe('Erfundener Verbindungsfehler');
  });

  it('zeigt den unberührten Zustand vor dem ersten Abruf', () => {
    expect(ansicht.hiorgStatus()).toMatchObject({
      icon: 'cloud_queue',
      text: 'HiOrg noch nicht abgerufen',
    });
  });
});

describe('Automatisches Laden aus der Kalender-Datenbank', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal('geladen'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    lade: vi.fn(),
  };

  function konfiguriere(kalender: ReturnType<typeof kalenderAttrappe>): PlanStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogDienst, useValue: dialog },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: KalenderDatenService, useValue: kalender },
        {
          provide: FeiertagService,
          useValue: { bundesland: signal('NW'), feiertage: signal(new Map()), lade: vi.fn() },
        },
        { provide: HiorgKalenderService, useValue: hiorg },
      ],
    });
    return TestBed.inject(PlanStore);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    hiorg.eintraege.set([]);
  });

  it('lädt den Kalender automatisch, solange er noch nicht abgerufen wurde', () => {
    const kalender = kalenderAttrappe();
    kalender.zustand.set('ungeprueft');
    konfiguriere(kalender);

    TestBed.runInInjectionContext(() => new Jahresplan());

    expect(kalender.laden).toHaveBeenCalledTimes(1);
  });

  it('lädt nicht erneut, wenn der Kalender verbunden ist und Daten zeigt', () => {
    const kalender = kalenderAttrappe();
    const store = konfiguriere(kalender);
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [{ ...leererTermin('2026-05-04'), id: 't1' }],
    });

    TestBed.runInInjectionContext(() => new Jahresplan());

    expect(kalender.laden).not.toHaveBeenCalled();
  });

  it('verwirft beim Zurückkehren keine ungespeicherten Änderungen', () => {
    const kalender = kalenderAttrappe();
    kalender.zustand.set('fehler');
    const store = konfiguriere(kalender);
    store.ungespeichert.set(true);

    TestBed.runInInjectionContext(() => new Jahresplan());

    expect(kalender.laden).not.toHaveBeenCalled();
  });
});

describe('Datenbank-Chip und Speichern', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const kalender = kalenderAttrappe();
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal('geladen'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    lade: vi.fn(),
  };
  const snackBar = { open: vi.fn() };
  let ansicht: Jahresplan;

  beforeEach(() => {
    vi.resetAllMocks();
    kalender.zustand.set('verbunden');
    kalender.fehler.set('');
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogDienst, useValue: dialog },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: KalenderDatenService, useValue: kalender },
        {
          provide: FeiertagService,
          useValue: { bundesland: signal('NW'), feiertage: signal(new Map()), lade: vi.fn() },
        },
        { provide: HiorgKalenderService, useValue: hiorg },
      ],
    });
    TestBed.inject(PlanStore).ungespeichert.set(true);
    ansicht = TestBed.runInInjectionContext(() => new Jahresplan());
  });

  it('zeigt die verbundene Datenbank', () => {
    expect(ansicht.datenbankStatus().text).toBe('Datenbank verbunden');
  });

  it('zeigt eine nicht eingerichtete Datenbank und sperrt das Speichern', async () => {
    kalender.zustand.set('nicht-eingerichtet');
    expect(ansicht.datenbankStatus().text).toBe('Datenbank nicht eingerichtet');
    expect(ansicht.kannSpeichern()).toBe(false);
    await ansicht.speichern();
    expect(kalender.speichern).not.toHaveBeenCalled();
  });

  it('zeigt die Fehlermeldung eines fehlgeschlagenen Abrufs im Tooltip', () => {
    kalender.zustand.set('fehler');
    kalender.fehler.set('Erfundener Fehler');
    expect(ansicht.datenbankStatus().tooltip).toBe('Erfundener Fehler');
  });

  it('bietet bei einem Konflikt eine Excel-Kopie an, statt den Stand zu verwerfen', async () => {
    kalender.speichern.mockRejectedValue(new KalenderKonfliktFehler('Das Jahr 2026'));
    kalender.exportieren.mockResolvedValue({ daten: new ArrayBuffer(0), dateiname: 'x.xlsx' });
    dialog.bestaetigen.mockResolvedValue(false);

    await ansicht.speichern();

    expect(dialog.bestaetigen).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(PlanStore).ungespeichert()).toBe(true);
    expect(kalender.laden).not.toHaveBeenCalled();
  });
});

describe('Tageszellen mit vielen Einträgen', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const kalender = kalenderAttrappe([2026]);
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal('geladen'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    lade: vi.fn(),
  };
  let ansicht: Jahresplan;
  let store: PlanStore;

  /** Fünf erfundene Dienste an einem Tag – der Fall, der die Wochenzeile aufblähte. */
  const DIENSTE: HiorgEintrag[] = [1, 2, 3, 4, 5].map((nummer) => ({
    schluessel: `dienst|2026-08-26|${nummer}`,
    beginn: '2026-08-26',
    ende: '2026-08-26',
    beginnZeit: '15:00',
    endeZeit: '23:00',
    name: `Erfundener Dienst ${nummer}`,
    art: 'dienst',
    url: 'https://www.hiorg-server.de/formulare.php?ri=1000000',
    id: `100000${nummer}`,
  }));

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogDienst, useValue: dialog },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: KalenderDatenService, useValue: kalender },
        {
          provide: FeiertagService,
          useValue: { bundesland: signal('NW'), feiertage: signal(new Map()), lade: vi.fn() },
        },
        { provide: HiorgKalenderService, useValue: hiorg },
      ],
    });
    hiorg.eintraege.set([]);
    store = TestBed.inject(PlanStore);
    ansicht = TestBed.runInInjectionContext(() => new Jahresplan());
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [
        {
          ...leererTermin('2026-08-26'),
          id: 't1',
          thema: 'Eigene Ausbildung',
          beginnZeit: '15:00',
        },
      ],
    });
    hiorg.eintraege.set(DIENSTE);
  });

  it('hält die Tageszelle auf der Höchstzahl an Karten', () => {
    ansicht.setzeHiorgEbene('einzeln');

    const inhalt = ansicht.tagesInhalt('2026-08-26');

    expect(inhalt.sichtbar.length).toBeLessThanOrEqual(ansicht.maxKartenProTag);
    expect(inhalt.verborgen).toBeGreaterThan(0);
    expect(inhalt.alle).toHaveLength(6);
  });

  it('fasst die HiOrg-Dienste eines Tages ohne eigenes Thema zu einer Karte zusammen', () => {
    // Genau der Fall aus dem Raster: ein Tag voller Dienste, kein Plantermin.
    store.setzeDokument({ ...leeresDocument(2026), termine: [] });
    expect(ansicht.hiorgEbene()).toBe('gesammelt');

    const inhalt = ansicht.tagesInhalt('2026-08-26');

    expect(inhalt.sichtbar.map((karte) => karte.art)).toEqual(['sammel']);
    expect(inhalt.verborgen).toBe(0);
  });

  it('sammelt abweichend benannte Dienste nicht ein, deckelt den Tag aber trotzdem', () => {
    // Der Plan nennt den Tag anders als HiOrg: jeder Dienst ist eine Abweichung
    // und bleibt einzeln – die Zelle bleibt trotzdem auf ihrer Höchstzahl.
    const inhalt = ansicht.tagesInhalt('2026-08-26');

    expect(inhalt.sichtbar.map((karte) => karte.art)).toEqual(['termin', 'hiorg']);
    expect(inhalt.sichtbar.length).toBeLessThanOrEqual(ansicht.maxKartenProTag);
    expect(inhalt.verborgen).toBe(4);
  });

  it('lässt einen Tag ohne Einträge leer', () => {
    const inhalt = ansicht.tagesInhalt('2026-08-27');

    expect(inhalt.sichtbar).toHaveLength(0);
    expect(inhalt.alle).toHaveLength(0);
  });
});

describe('Ansichten und Ideen auf Lücken', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const kalender = kalenderAttrappe([2020]);
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal('geladen'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    lade: vi.fn(),
  };
  const snackBar = { open: vi.fn() };
  let store: PlanStore;

  function erzeuge(): Jahresplan {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogDienst, useValue: dialog },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: KalenderDatenService, useValue: kalender },
        {
          provide: FeiertagService,
          useValue: { bundesland: signal('NW'), feiertage: signal(new Map()), lade: vi.fn() },
        },
        { provide: HiorgKalenderService, useValue: hiorg },
      ],
    });
    store = TestBed.inject(PlanStore);
    return TestBed.runInInjectionContext(() => new Jahresplan());
  }

  afterEach(() => vi.unstubAllGlobals());

  function stubMatchMedia(schmal: boolean): void {
    vi.stubGlobal('matchMedia', (abfrage: string) => ({
      matches: abfrage.includes('780px') && schmal,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }

  it('startet auf breiten Bildschirmen mit dem Monatsraster', () => {
    stubMatchMedia(false);
    expect(erzeuge().ansicht()).toBe('monat');
  });

  it('startet auf schmalen Bildschirmen mit der Agendaliste', () => {
    stubMatchMedia(true);
    expect(erzeuge().ansicht()).toBe('liste');
  });

  it('startet ohne matchMedia (Testumgebung) mit dem Monatsraster', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(erzeuge().ansicht()).toBe('monat');
  });

  it('füllt beim Einplanen einer Idee den leeren Platzhalter der nächsten Lücke', () => {
    const ansicht = erzeuge();
    const platzhalter = { ...leererTermin('2020-01-06'), id: 'platzhalter' };
    const idee = { ...leererTermin(null), id: 'idee', thema: 'Erfundene Idee' };
    store.setzeDokument({ ...leeresDocument(2020), termine: [platzhalter], backlog: [idee] });

    ansicht.ideeAufNaechsteLuecke(idee);

    const belegt = store.termine().filter((t) => t.datum === '2020-01-06');
    expect(belegt.map((t) => t.thema)).toEqual(['Erfundene Idee']);
    expect(store.backlog()).toEqual([]);
    expect(snackBar.open).toHaveBeenCalledWith(
      expect.stringContaining('eingeplant'),
      'OK',
      expect.anything(),
    );
  });

  it('legt eine Idee auf einen Diensttag ohne Platzhalter, ohne einen Termin zu ersetzen', () => {
    const ansicht = erzeuge();
    const belegt = { ...leererTermin('2020-01-06'), id: 'belegt', thema: 'Erfundenes Thema' };
    const idee = { ...leererTermin(null), id: 'idee', thema: 'Erfundene Idee' };
    store.setzeDokument({ ...leeresDocument(2020), termine: [belegt], backlog: [idee] });

    ansicht.ideeAufNaechsteLuecke(idee);

    expect(store.termine().find((t) => t.id === 'belegt')?.thema).toBe('Erfundenes Thema');
    expect(store.termine().find((t) => t.id === 'idee')?.datum).toBe('2020-01-13');
  });

  it('meldet, wenn keine Lücke mehr im Jahr liegt, und lässt die Idee liegen', () => {
    const ansicht = erzeuge();
    const alleBelegt = wochentageImJahr(2020, 'Mo').map((datum) => ({
      ...leererTermin(datum),
      thema: 'Erfundenes Thema',
    }));
    const idee = { ...leererTermin(null), id: 'idee', thema: 'Erfundene Idee' };
    store.setzeDokument({ ...leeresDocument(2020), termine: alleBelegt, backlog: [idee] });

    ansicht.ideeAufNaechsteLuecke(idee);

    expect(store.backlog().map((t) => t.id)).toEqual(['idee']);
    expect(snackBar.open).toHaveBeenCalledWith(
      expect.stringContaining('Keine Lücke mehr'),
      'OK',
      expect.anything(),
    );
  });
});
