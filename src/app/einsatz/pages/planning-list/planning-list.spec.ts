import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { PlanningList } from './planning-list';
import { EfsApiService, EfsDetailResult } from '../../services/efs-api.service';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PlanungCloudService } from '../../services/planung-cloud.service';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { erzeugeTestplanung } from '../../services/testing/pep-testdaten';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import { InMemoryEinsatzStorage } from '../../testing/in-memory-einsatzplanung';
import { testEinsatz } from '../../testing/vb-testdaten';

function routeMit(abfrage: Record<string, string> = {}) {
  return {
    provide: ActivatedRoute,
    useValue: { snapshot: { queryParamMap: convertToParamMap(abfrage) } },
  };
}

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
        routeMit(),
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
        routeMit(),
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

describe('Rückkehr von der HiOrg-Anmeldung', () => {
  function listeMit(abfrage: Record<string, string>) {
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: { fehler: signal(''), getVeranstaltungen: vi.fn() } },
        { provide: Router, useValue: { navigate } },
        { provide: PlanungCloudService, useValue: { listeLaden: vi.fn() } },
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

describe('Einsatz aus der Liste öffnen', () => {
  const gruppe = {
    veranstaltung_id: '4711',
    titel: 'Weihnachtsmarkt Ummeln',
    datum_von: '2026-12-05T09:00:00.000Z',
    datum_bis: '2026-12-05T19:30:00.000Z',
    ort: 'Ummeln',
    schichten: [],
  };

  function listeMit(speicher: InMemoryEinsatzStorage) {
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: { fehler: signal(''), getVeranstaltungen: vi.fn() } },
        { provide: Router, useValue: { navigate } },
        { provide: PlanungCloudService, useValue: { listeLaden: vi.fn() } },
        { provide: ApiEinsatzStorage, useValue: speicher },
        routeMit(),
      ],
    });
    return { liste: TestBed.runInInjectionContext(() => new PlanningList()), navigate };
  }

  it('legt für eine neue Veranstaltung einen Einsatz an und öffnet die Einsatzseite', async () => {
    const speicher = new InMemoryEinsatzStorage();
    const { liste, navigate } = listeMit(speicher);
    await liste.einsatzOeffnen(gruppe);

    const alle = await speicher.ladeEinsaetze();
    expect(alle).toHaveLength(1);
    expect(alle[0]).toMatchObject({
      hiorgVeranstaltungId: '4711',
      titel: 'Weihnachtsmarkt Ummeln',
    });
    expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', alle[0].id]);
  });

  it('öffnet für eine bekannte Veranstaltung den vorhandenen Einsatz ohne Neuanlage', async () => {
    const speicher = new InMemoryEinsatzStorage();
    const vorhanden = testEinsatz({ hiorgVeranstaltungId: '4711' });
    speicher._vorbelegen(vorhanden);
    const { liste, navigate } = listeMit(speicher);
    await liste.einsatzOeffnen(gruppe);

    expect(await speicher.ladeEinsaetze()).toHaveLength(1);
    expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', vorhanden.id]);
  });

  it('kennzeichnet PEP und trennt Einsätze ohne HiOrg ab', async () => {
    const speicher = new InMemoryEinsatzStorage();
    speicher._vorbelegen(testEinsatz({ hiorgVeranstaltungId: '4711', pepId: crypto.randomUUID() }));
    const ohne = testEinsatz({ titel: 'Dienst ohne HiOrg' });
    speicher._vorbelegen(ohne);
    const { liste } = listeMit(speicher);
    liste.ngOnInit();
    await vi.waitFor(() => expect(liste.einsatzListeGeladen()).toBe(true));

    expect(liste.einsatzJeVeranstaltung().get('4711')?.pepId).not.toBeNull();
    expect(liste.einsaetzeOhneHiorg().map((e) => e.id)).toEqual([ohne.id]);
  });
});
