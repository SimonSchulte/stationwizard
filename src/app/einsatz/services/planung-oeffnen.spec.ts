import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EfsEinsatzGruppe } from '../models/planung.model';
import { EfsApiService } from './efs-api.service';
import { PlanungOeffnenDienst } from './planung-oeffnen';
import { PlanungStoreService } from './planung-store.service';

describe('PlanungOeffnenDienst.planungAusEfsBauen', () => {
  const api = {
    getVeranstaltungDetail: vi.fn(),
    matchFahrzeug: vi.fn(),
    getVeranstaltungen: vi.fn(),
    groupEinsaetze: vi.fn(),
  };
  const schicht = (id: string) => ({
    id,
    titel: 'Schicht',
    datum_von: '2026-12-05T09:00:00',
    datum_bis: '2026-12-05T12:00:00',
  });
  const gruppe: EfsEinsatzGruppe = {
    veranstaltung_id: '4711',
    titel: 'Weihnachtsmarkt',
    datum_von: '2026-12-05T09:00:00',
    datum_bis: '2026-12-05T19:00:00',
    schichten: [schicht('s1'), schicht('s2')],
  };
  let dienst: PlanungOeffnenDienst;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: EfsApiService, useValue: api }] });
    dienst = TestBed.inject(PlanungOeffnenDienst);
  });

  it('baut je Schicht einen Posten, führt Einsatzkräfte ohne Doppelte zusammen und öffnet nichts', async () => {
    api.getVeranstaltungDetail.mockImplementation(async (id: string) => ({
      zeitraum_bemerk: id === 's1' ? 'Vormittag' : undefined,
      einsatzkraefte: [
        { hiorg_org_id: 'a', vorname: 'Nord', nachname: 'Testperson' },
        id === 's2' ? { hiorg_org_id: 'b', vorname: 'Süd', nachname: 'Testperson' } : null,
      ].filter(Boolean),
      einsatzmittel: id === 's1' ? [{ funkruf: 'Test 1' }] : [],
    }));
    api.matchFahrzeug.mockReturnValue({ funkruf: 'Test 1', seriennummer: 'X', hiorgId: null });
    const store = TestBed.inject(PlanungStoreService);

    const planung = await dienst.planungAusEfsBauen(gruppe);

    expect(planung.name).toBe('Weihnachtsmarkt');
    expect(planung.hiorg_einsatz_id).toBe('4711');
    expect(planung.posten.map((p) => [p.label, p.hiorg_schicht_id])).toEqual([
      ['Vormittag', 's1'],
      [expect.stringMatching(/^\d\d:\d\d–\d\d:\d\d$/), 's2'],
    ]);
    expect(planung.posten[0].fahrzeug?.funkruf).toBe('Test 1');
    expect(planung.posten[1].fahrzeug).toBeNull();
    expect(planung.einsatzkraefte.map((k) => k.name)).toEqual([
      'Testperson Nord',
      'Testperson Süd',
    ]);
    expect(store.active()).toBeNull();
  });

  it('reicht einen Fehler des Detailabrufs weiter', async () => {
    api.getVeranstaltungDetail.mockRejectedValue(new Error('EFS nicht erreichbar'));
    await expect(dienst.planungAusEfsBauen(gruppe)).rejects.toThrow('EFS nicht erreichbar');
  });

  it('findet die Gruppe zu einer Veranstaltung oder liefert null', async () => {
    api.getVeranstaltungen.mockResolvedValue([]);
    api.groupEinsaetze.mockReturnValue([gruppe]);
    expect(await dienst.gruppeFuerVeranstaltung('4711')).toBe(gruppe);
    expect(await dienst.gruppeFuerVeranstaltung('9999')).toBeNull();
  });
});
