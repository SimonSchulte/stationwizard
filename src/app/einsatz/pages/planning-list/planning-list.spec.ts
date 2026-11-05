import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningList } from './planning-list';
import { EfsApiService, EfsDetailResult } from '../../services/efs-api.service';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PlanungCloudService } from '../../services/planung-cloud.service';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { erzeugeTestplanung } from '../../services/testing/pep-testdaten';
import { EinsatzAktionenDienst } from '../../services/einsatz-aktionen';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import {
  InMemoryEinsatzStorage,
  InMemoryVorbereitungStorage,
} from '../../testing/in-memory-einsatzplanung';
import { testEinsatz, testVorbereitung } from '../../testing/vb-testdaten';

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
  const aktionen = {
    laufend: signal<string | null>(null),
    pepOeffnenOderAnlegen: vi.fn().mockResolvedValue(undefined),
    vbOeffnenOderAnlegen: vi.fn().mockResolvedValue(undefined),
  };
  let speicher: InMemoryEinsatzStorage;
  let vorbereitungen: InMemoryVorbereitungStorage;
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
        {
          provide: PlanungCloudService,
          useValue: {
            listeLaden: vi.fn(),
            listeLaedt: signal(false),
            listenFehler: signal(''),
            dateien: signal([]),
            namen: signal({}),
          },
        },
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

  function zeile(fixture: { nativeElement: HTMLElement }, titel: string): HTMLElement {
    const treffer = [...fixture.nativeElement.querySelectorAll<HTMLElement>('tr, li')].find((z) =>
      z.textContent?.includes(titel),
    );
    if (!treffer) throw new Error(`Keine Zeile „${titel}“`);
    return treffer;
  }

  function knoepfe(z: HTMLElement): string[] {
    return [...z.querySelectorAll('app-einsatz-knoepfe button')].map((k) =>
      (k.textContent ?? '')
        .replace(/assignment_ind|checklist/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  beforeEach(() => {
    vorbereitungen = new InMemoryVorbereitungStorage();
    speicher = new InMemoryEinsatzStorage(vorbereitungen);
    navigate = vi.fn().mockResolvedValue(true);
    dialogAntwort = undefined;
    aktionen.laufend.set(null);
    aktionen.pepOeffnenOderAnlegen.mockClear();
    aktionen.vbOeffnenOderAnlegen.mockClear();
  });

  it('beschriftet die Knöpfe je Stand: anlegen ohne Einsatz, öffnen mit PEP und VB', async () => {
    const mitBeidem = testEinsatz({ hiorgVeranstaltungId: '4711', pepId: crypto.randomUUID() });
    speicher._vorbelegen(mitBeidem);
    vorbereitungen._vorbelegen(mitBeidem.id, testVorbereitung());
    const nurPep = testEinsatz({ hiorgVeranstaltungId: '4700', pepId: crypto.randomUUID() });
    speicher._vorbelegen(nurPep);
    speicher._vorbelegen(testEinsatz({ titel: 'Dienst ohne HiOrg' }));
    const fixture = await oeffnen();

    expect(knoepfe(zeile(fixture, 'Weihnachtsmarkt'))).toEqual(['PEP öffnen', 'VB öffnen']);
    expect(knoepfe(zeile(fixture, 'Stadtlauf'))).toEqual(['PEP anlegen', 'VB anlegen']);
    expect(knoepfe(zeile(fixture, 'Altes Fest'))).toEqual(['PEP öffnen', 'VB anlegen']);
    expect(knoepfe(zeile(fixture, 'Dienst ohne HiOrg'))).toEqual(['PEP anlegen', 'VB anlegen']);
  });

  it('übergibt Veranstaltung bzw. Einsatz an den Aktionsdienst', async () => {
    const ohne = testEinsatz({ titel: 'Dienst ohne HiOrg' });
    speicher._vorbelegen(ohne);
    const fixture = await oeffnen();

    const markt = zeile(fixture, 'Weihnachtsmarkt').querySelectorAll('button');
    markt[0].click();
    markt[1].click();
    expect(aktionen.pepOeffnenOderAnlegen).toHaveBeenCalledWith(gruppen[0]);
    expect(aktionen.vbOeffnenOderAnlegen).toHaveBeenCalledWith(gruppen[0]);

    zeile(fixture, 'Dienst ohne HiOrg').querySelectorAll('button')[1].click();
    expect(aktionen.vbOeffnenOderAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: ohne.id }),
    );
  });

  it('springt beim Zeilenklick nicht mehr auf eine Einsatzseite', async () => {
    const fixture = await oeffnen();
    zeile(fixture, 'Weihnachtsmarkt').click();
    zeile(fixture, 'Weihnachtsmarkt').querySelector('button')!.click();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('tr.einsatz-row')).toBeNull();
  });

  it('sperrt alle Knöpfe, solange eine Aktion läuft', async () => {
    const fixture = await oeffnen();
    aktionen.laufend.set('hiorg:4711');
    fixture.detectChanges();
    const wurzel: HTMLElement = fixture.nativeElement;
    const alle = [...wurzel.querySelectorAll<HTMLButtonElement>('app-einsatz-knoepfe button')];
    expect(alle.length).toBeGreaterThan(0);
    expect(alle.every((k) => k.disabled)).toBe(true);
  });

  it('zeigt am VB-Knopf die Kennzahlen als Tooltip-Text', async () => {
    const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711' });
    speicher._vorbelegen(einsatz);
    vorbereitungen._vorbelegen(einsatz.id, testVorbereitung());
    const fixture = await oeffnen();
    const vb = zeile(fixture, 'Weihnachtsmarkt').querySelectorAll('button')[1];
    expect(vb.getAttribute('aria-label')).toBe('VB öffnen: Weihnachtsmarkt');
  });

  it('legt „Einsatz anlegen“ an und bleibt in der Liste', async () => {
    dialogAntwort = { titel: 'Neuer Dienst', beginn: null, ende: null, ort: null };
    const fixture = await oeffnen();
    await fixture.componentInstance.einsatzAnlegen();
    fixture.detectChanges();

    expect((await speicher.ladeEinsaetze()).map((e) => e.titel)).toEqual(['Neuer Dienst']);
    expect(navigate).not.toHaveBeenCalled();
    expect(knoepfe(zeile(fixture, 'Neuer Dienst'))).toEqual(['PEP anlegen', 'VB anlegen']);
  });
});
