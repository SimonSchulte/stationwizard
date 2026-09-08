import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { PlanningList } from './planning-list';
import { EfsApiService, EfsDetailResult } from '../../services/efs-api.service';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PlanungCloudService } from '../../services/planung-cloud.service';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { erzeugeTestplanung } from '../../services/testing/pep-testdaten';

describe('EFS-Details beim Planwechsel', () => {
  it('schreibt verzögert geladene Details nicht in einen inzwischen geöffneten anderen Plan', async () => {
    let antworten!: (detail: EfsDetailResult) => void;
    const antwort = new Promise<EfsDetailResult>((resolve) => {
      antworten = resolve;
    });
    const api = { getVeranstaltungDetail: vi.fn(() => antwort), fehler: signal('') };
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: api },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: PlanungCloudService, useValue: { hatLokaleAenderungen: () => false } },
      ],
    });
    const store = TestBed.inject(PlanungStoreService);
    const liste = TestBed.runInInjectionContext(() => new PlanningList());
    const laden = liste.openEfsGruppe({
      veranstaltung_id: 'test-veranstaltung',
      titel: 'Testübung',
      datum_von: '',
      datum_bis: '',
      schichten: [{ id: 'test-schicht', titel: 'Testschicht', datum_von: '', datum_bis: '' }],
    });
    const andererPlan = store.createPlanung('Anderer lokaler Plan');
    antworten({
      einsatzkraefte: [{ hiorg_org_id: 'test-person', vorname: 'Nord', nachname: 'Testperson' }],
      einsatzmittel: [],
    });
    await laden;
    expect(store.active()).toEqual(andererPlan);
    expect(store.active()?.einsatzkraefte).toEqual([]);
    expect(store.active()?.posten).toEqual([]);
  });

  it('lädt bei abgebrochener Ersetzungsbestätigung keine Cloud-Datei', async () => {
    const cloud = {
      laden: vi.fn(),
      hatLokaleAenderungen: () => true,
      fehlermeldung: (fehler: Error) => fehler.message,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: { fehler: signal('') } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: PlanungCloudService, useValue: cloud },
        { provide: DialogDienst, useValue: { bestaetigen: vi.fn().mockResolvedValue(false) } },
      ],
    });
    const store = TestBed.inject(PlanungStoreService);
    const planung = erzeugeTestplanung();
    store.importPlanung(planung);
    const liste = TestBed.runInInjectionContext(() => new PlanningList());
    await liste.cloudPlanungLaden(planung.id);
    expect(cloud.laden).not.toHaveBeenCalled();
    expect(store.active()).toEqual(planung);
    expect(liste.cloudLadeId()).toBeNull();
  });
});
