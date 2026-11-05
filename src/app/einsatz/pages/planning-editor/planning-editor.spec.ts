import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningEditor } from './planning-editor';
import { EfsApiService, EfsDetailResult } from '../../services/efs-api.service';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PlanungCloudService } from '../../services/planung-cloud.service';
import { PdfExportService } from '../../services/pdf-export.service';
import { erzeugeTestplanung } from '../../services/testing/pep-testdaten';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';

describe('Asynchrone Editor-Aktionen', () => {
  const dialog = { bestaetigen: vi.fn(), hinweis: vi.fn().mockResolvedValue(undefined) };
  const api = { getVeranstaltungDetail: vi.fn(), fehler: signal(''), erreichbar: signal(true) };
  const cloud = {
    speichern: vi.fn(),
    hatLokaleAenderungen: vi.fn(),
    fehlermeldung: (fehler: Error) => fehler.message,
  };
  let editor: PlanningEditor;
  let store: PlanungStoreService;
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: api },
        { provide: PlanungCloudService, useValue: cloud },
        { provide: PdfExportService, useValue: {} },
        { provide: MatDialog, useValue: {} },
        { provide: DialogDienst, useValue: dialog },
        { provide: DomSanitizer, useValue: { bypassSecurityTrustUrl: (url: string) => url } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    store = TestBed.inject(PlanungStoreService);
    editor = TestBed.runInInjectionContext(() => new PlanningEditor());
  });

  it('wendet einen verspäteten EFS-Sync nicht auf einen anderen Plan an', async () => {
    let antworten!: (detail: EfsDetailResult) => void;
    api.getVeranstaltungDetail.mockImplementation(
      () =>
        new Promise<EfsDetailResult>((resolve) => {
          antworten = resolve;
        }),
    );
    const planung = { ...erzeugeTestplanung(), hiorg_einsatz_id: 'test-einsatz' };
    store.importPlanung(planung);
    const synchronisieren = editor.updateFromEfs(planung);
    const andererPlan = store.createPlanung('Anderer Testplan');
    antworten({
      einsatzkraefte: [{ hiorg_org_id: 'test-neu', nachname: 'Testperson', vorname: 'Süd' }],
      einsatzmittel: [],
    });
    await synchronisieren;
    expect(store.active()).toEqual(andererPlan);
    expect(editor.efsUpdating()).toBe(false);
  });

  it('meldet während des Speicherns neu hinzugekommene Änderungen als ungespeichert', async () => {
    let fertig!: () => void;
    cloud.speichern.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          fertig = resolve;
        }),
    );
    cloud.hatLokaleAenderungen.mockReturnValue(true);
    const planung = erzeugeTestplanung();
    store.importPlanung(planung);
    const speichern = editor.cloudSpeichern();
    store.updateActive({ ...planung, name: 'Nach Speicherstart geändert' });
    fertig();
    await speichern;
    expect(editor.cloudStatus()).toContain('noch ungespeichert');
  });

  it('zeigt nach einem Planwechsel keinen Speichererfolg für den fremden Plan', async () => {
    let fertig!: () => void;
    cloud.speichern.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          fertig = resolve;
        }),
    );
    store.importPlanung(erzeugeTestplanung());
    const speichern = editor.cloudSpeichern();
    store.createPlanung('Anderer Testplan');
    fertig();
    await speichern;
    expect(editor.cloudStatus()).toBe('');
  });

  it('aktualisiert den Speicherhinweis auch bei Änderungen nach dem abgeschlossenen Speichern', async () => {
    cloud.speichern.mockResolvedValue(undefined);
    cloud.hatLokaleAenderungen.mockReturnValue(false);
    const planung = erzeugeTestplanung();
    store.importPlanung(planung);
    await editor.cloudSpeichern();
    expect(editor.cloudStatus()).toContain('wurde in Nextcloud gespeichert');
    cloud.hatLokaleAenderungen.mockReturnValue(true);
    store.updateActive({ ...planung, name: 'Später bearbeitet' });
    expect(editor.cloudStatus()).toContain('noch ungespeichert');
  });

  it('löscht einen Posten bei abgebrochener Bestätigung nicht', async () => {
    dialog.bestaetigen.mockResolvedValue(false);
    const planung = erzeugeTestplanung();
    store.importPlanung(planung);
    await editor.deletePosten(planung.posten[0]);
    expect(store.active()).toEqual(planung);
  });

  it('löscht nach einer Bestätigung keine inzwischen geänderten Zuteilungen', async () => {
    let bestaetigen!: (entscheidung: boolean) => void;
    dialog.bestaetigen.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          bestaetigen = resolve;
        }),
    );
    const planung = erzeugeTestplanung();
    store.importPlanung(planung);
    const loeschen = editor.deletePosten(planung.posten[0]);
    store.updatePostenLabel(planung.posten[0].id, 'Während des Dialogs geändert');
    bestaetigen(true);
    await loeschen;
    expect(store.active()?.posten[0].label).toBe('Während des Dialogs geändert');
    expect(dialog.hinweis).toHaveBeenCalled();
  });
});
