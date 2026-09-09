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
  };
  const hiorg = {
    eintraege: signal<readonly HiorgEintrag[]>([]),
    zustand: signal('geladen'),
    fehler: signal(''),
    verworfen: signal(0),
    laedt: signal(false),
    anzeigen: signal(true),
    setzeAnzeigen: vi.fn(),
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
    hiorg.anzeigen.set(true);
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

  it('blendet die HiOrg-Ebene aus, solange sie abgeschaltet ist', () => {
    hiorg.eintraege.set([HIORG_EINTRAG]);
    hiorg.anzeigen.set(false);

    expect(ansicht.hiorgTag('2026-05-04')).toBeNull();
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
