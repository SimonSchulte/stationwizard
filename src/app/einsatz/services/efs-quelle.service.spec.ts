import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../kern/worker-client';
import type { EfsEinsatz, EfsEinsatzkraft } from '../models/efs.model';
import { EfsApiService } from './efs-api.service';
import { EfsQuelle } from './efs-quelle.service';

function einsatz(id: string, titel: string, tag: string, veranstaltung?: string): EfsEinsatz {
  return {
    id,
    titel,
    datum_von: `${tag}T09:00:00`,
    datum_bis: `${tag}T17:00:00`,
    ...(veranstaltung ? { veranstaltung_id: veranstaltung } : {}),
  };
}

const kraft = (id: string, nachname: string): EfsEinsatzkraft => ({
  hiorg_org_id: id,
  vorname: 'Vorname',
  nachname,
  ausbildungen: [],
});

describe('EfsQuelle', () => {
  const api = { veranstaltungenLaden: vi.fn(), einsatzkraefteLaden: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: EfsApiService, useValue: api },
        { provide: WorkerClient, useValue: { zustand: () => 'erreichbar' } },
      ],
    });
  });

  it('lädt die Liste einmal je Sitzung und gleicht danach ab', async () => {
    api.veranstaltungenLaden.mockResolvedValue([einsatz('1', 'Zeltlager', '2026-07-11', 'v1')]);
    const quelle = TestBed.inject(EfsQuelle);
    await Promise.all([quelle.laden(), quelle.laden()]);
    await quelle.laden();
    expect(api.veranstaltungenLaden).toHaveBeenCalledOnce();
    expect(quelle.erreichbar()).toBe(true);
    expect(quelle.abgleich('Zeltlager', '2026-07-11T10:00').art).toBe('treffer');
    expect(quelle.abgleich('Anderes', '2026-07-11T10:00').art).toBe('keiner');
  });

  it('meldet bei einem Fehler „fehler“ und gleicht dann nichts ab', async () => {
    api.veranstaltungenLaden.mockRejectedValue(new Error('EFS weg'));
    const quelle = TestBed.inject(EfsQuelle);
    await quelle.laden();
    expect(quelle.zustand()).toBe('fehler');
    expect(quelle.fehler()).toBe('EFS weg');
    expect(quelle.abgleich('Zeltlager', '2026-07-11T10:00').art).toBe('keiner');
    api.veranstaltungenLaden.mockResolvedValue([]);
    await quelle.laden();
    expect(quelle.zustand()).toBe('verbunden');
  });

  it('stellt die Wahl der Person über die Regel, auch „keine davon“', async () => {
    api.veranstaltungenLaden.mockResolvedValue([
      einsatz('1', 'Sanitätsdienst Stadtlauf 2026', '2026-12-05', 'v1'),
      einsatz('2', 'Sanitätsdienst Stadtlauf Nord', '2026-12-05', 'v2'),
    ]);
    const quelle = TestBed.inject(EfsQuelle);
    await quelle.laden();
    const titel = 'Sanitätsdienst Stadtlauf';
    expect(quelle.abgleich(titel, '2026-12-05T08:00').art).toBe('pruefen');
    quelle.entscheide(titel, '2026-12-05T08:00', 'v2');
    expect(quelle.abgleich(titel, '2026-12-05T08:00').treffer?.veranstaltung_id).toBe('v2');
    quelle.entscheide(titel, '2026-12-05T08:00', null);
    expect(quelle.abgleich(titel, '2026-12-05T08:00').art).toBe('keiner');
  });

  it('führt das Personal aller Schichten ohne Doppelte zusammen und puffert es', async () => {
    api.veranstaltungenLaden.mockResolvedValue([
      einsatz('1', 'Zeltlager', '2026-07-11', 'v1'),
      einsatz('2', 'Zeltlager', '2026-07-11', 'v1'),
    ]);
    api.einsatzkraefteLaden.mockImplementation(async (id: string) =>
      id === '1'
        ? [kraft('a', 'Eins'), kraft('b', 'Zwei')]
        : [kraft('b', 'Zwei'), kraft('c', 'Drei')],
    );
    const quelle = TestBed.inject(EfsQuelle);
    await quelle.laden();
    const gruppe = quelle.gruppen()[0];
    const personal = await quelle.personalLaden(gruppe);
    expect(personal.map((k) => k.hiorg_org_id)).toEqual(['a', 'b', 'c']);
    await quelle.personalLaden(gruppe);
    expect(api.einsatzkraefteLaden).toHaveBeenCalledTimes(2);
    await quelle.personalLaden(gruppe, true);
    expect(api.einsatzkraefteLaden).toHaveBeenCalledTimes(4);
  });
});
