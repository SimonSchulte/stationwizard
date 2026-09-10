import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { PlanStore } from '../../services/plan-store';
import { WorkbookService } from '../../services/workbook.service';
import { FeiertagService } from '../../services/feiertage.service';
import { HiorgKalenderService } from '../../services/hiorg-kalender.service';
import type { HiorgEintrag } from '../../models/hiorg-kalender.model';
import { Jahresplan } from './jahresplan';
import { leererTermin, leeresDocument } from '../../models/plan.model';

const HIORG_EINTRAG: HiorgEintrag = {
  schluessel: 'test|2026-05-04|Erfundene Ausbildung',
  beginn: '2026-05-04',
  ende: '2026-05-04',
  beginnZeit: '19:30',
  endeZeit: '21:30',
  name: 'Erfundene Ausbildung Verpflegung',
  art: 'termin',
  url: 'https://www.hiorg-server.de/formulare.php?ri=1000001',
};

describe('Bestätigungen im Ausbildungsplan', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const workbook = {
    ziel: signal(null),
    beschaeftigt: signal(false),
    neuLaden: vi.fn(),
    neuesDokument: vi.fn(),
    waehleJahr: vi.fn(),
    verfuegbareJahre: signal<number[]>([2026]),
  };
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
        { provide: WorkbookService, useValue: workbook },
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
    expect(workbook.neuLaden).not.toHaveBeenCalled();
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
    const neuerPlan = ansicht.neuerPlan();
    const inzwischen = leeresDocument();
    store.setzeDokument(inzwischen);
    bestaetigen(true);
    await neuerPlan;
    expect(workbook.neuesDokument).not.toHaveBeenCalled();
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

  it('warnt, wenn der Plan an diesem Tag anders heißt', () => {
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [{ ...leererTermin('2026-05-04'), id: 't1', thema: 'Anderes Thema' }],
    });
    hiorg.eintraege.set([HIORG_EINTRAG]);

    expect(ansicht.hiorgAbgleich().anzahlAbweichungen).toBe(1);
    expect(ansicht.hiorgAbgleich().tageMitAbweichung.has('2026-05-04')).toBe(true);
  });

  it('übernimmt den HiOrg-Namen nach Bestätigung in den Plan', async () => {
    store.setzeDokument({
      ...leeresDocument(2026),
      termine: [{ ...leererTermin('2026-05-04'), id: 't1', thema: 'Anderes Thema' }],
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
      termine: [{ ...leererTermin('2026-05-04'), id: 't1', thema: 'Anderes Thema' }],
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
  const workbook = {
    ziel: signal(null),
    beschaeftigt: signal(false),
    neuLaden: vi.fn(),
    neuesDokument: vi.fn(),
    waehleJahr: vi.fn(),
    verfuegbareJahre: signal<number[]>([aktuellesJahr]),
  };
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
        { provide: WorkbookService, useValue: workbook },
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
  const workbook = {
    ziel: signal(null),
    beschaeftigt: signal(false),
    neuLaden: vi.fn(),
    neuesDokument: vi.fn(),
    waehleJahr: vi.fn(),
    verfuegbareJahre: signal<number[]>([2026]),
  };
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
        { provide: WorkbookService, useValue: workbook },
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

  it('zeigt die Anzahl geladener Termine im verbundenen Zustand', () => {
    hiorg.zustand.set('geladen');
    hiorg.eintraege.set([HIORG_EINTRAG, HIORG_EINTRAG]);

    expect(ansicht.hiorgStatus()).toMatchObject({ icon: 'cloud_done', text: '2 HiOrg-Termine' });
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
