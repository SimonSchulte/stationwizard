import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { PlanStore } from '../../services/plan-store';
import { WorkbookService } from '../../services/workbook.service';
import { FeiertagService } from '../../services/feiertage.service';
import { Jahresplan } from './jahresplan';
import { leeresDocument } from '../../models/plan.model';

describe('Bestätigungen im Ausbildungsplan', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn() };
  const workbook = {
    ziel: signal(null),
    beschaeftigt: signal(false),
    neuLaden: vi.fn(),
    neuesDokument: vi.fn(),
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
      ],
    });
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
});
