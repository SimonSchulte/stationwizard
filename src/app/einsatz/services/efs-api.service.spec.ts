import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../kern/worker-client';
import { EfsApiService, gruppiereEfsEinsaetze } from './efs-api.service';

describe('EfsApiService', () => {
  const worker = { json: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
  });

  it('liest die Veranstaltungsliste in einem Aufruf und tolerant gegenüber Zeitformaten', async () => {
    worker.json.mockResolvedValue({
      status: 'OK',
      einsaetze: [
        { id: 7, titel: 'Zeltlager', datum_von: '2026-07-10 08:00:00', datum_bis: '2026-07-12' },
        { id: '8', stichwort: 'Übung', beginn: 1_783_000_000, end: 1_783_003_600, ort: 'Halle' },
        { titel: 'ohne Id' },
      ],
    });
    const liste = await TestBed.inject(EfsApiService).veranstaltungenLaden();
    expect(worker.json).toHaveBeenCalledOnce();
    expect(worker.json.mock.calls[0][0]).toBe('/api/efs/getveranstaltungen');
    expect(liste.map((e) => [e.id, e.titel])).toEqual([
      ['7', 'Zeltlager'],
      ['8', 'Übung'],
    ]);
    expect(liste[1].datum_von).toMatch(/^2026-/);
    expect(liste[1].ort).toBe('Halle');
  });

  it('wirft bei einem Status ungleich OK mit der Meldung von EFS', async () => {
    worker.json.mockResolvedValue({ status: 'FEHLER', fehler: 'Schlüssel ungültig' });
    await expect(TestBed.inject(EfsApiService).veranstaltungenLaden()).rejects.toThrow(
      'Schlüssel ungültig',
    );
    worker.json.mockResolvedValue({ status: 'OK', einsaetze: 'kaputt' });
    await expect(TestBed.inject(EfsApiService).veranstaltungenLaden()).rejects.toThrow(
      /Veranstaltungsliste/,
    );
  });

  it('liest Einsatzkräfte mit Qualifikationen über das übernommene Mapping', async () => {
    worker.json.mockResolvedValue({
      status: 'OK',
      einsatzkraefte_imeinsatz: {
        a: {
          hiorg_ek_id: 11,
          vorname: 'Anna',
          nachname: 'Muster',
          med_qual: 'Rettungssanitäter/in',
          fuehr_qual: 'Gruppenführer:in',
          tel_mobil: '0170 0000000',
        },
        b: { vorname: '', nachname: '' },
      },
    });
    const kraefte = await TestBed.inject(EfsApiService).einsatzkraefteLaden('7');
    const [pfad, optionen] = worker.json.mock.calls[0];
    expect(pfad).toBe('/api/efs/getveranstaltung');
    expect(JSON.parse(optionen.body)).toEqual({ id: '7' });
    expect(kraefte).toEqual([
      {
        hiorg_org_id: '11',
        vorname: 'Anna',
        nachname: 'Muster',
        ausbildungen: ['RS', 'GF'],
        telefonnummer: '0170 0000000',
      },
    ]);
  });

  it('weist eine ungültige Einsatzkräfteliste ab', async () => {
    worker.json.mockResolvedValue({ status: 'OK', einsatzkraefte_imeinsatz: [1] });
    await expect(TestBed.inject(EfsApiService).einsatzkraefteLaden('7')).rejects.toThrow(
      /Einsatzkräfteliste/,
    );
  });
});

describe('gruppiereEfsEinsaetze', () => {
  it('führt Schichten einer Veranstaltung zusammen und sortiert nach Beginn', () => {
    const gruppen = gruppiereEfsEinsaetze([
      {
        id: '2',
        titel: 'Markt',
        datum_von: '2026-12-12T18:00',
        datum_bis: '2026-12-13T01:00',
        veranstaltung_id: 'v',
      },
      {
        id: '1',
        titel: 'Markt',
        datum_von: '2026-12-12T14:00',
        datum_bis: '2026-12-12T18:00',
        veranstaltung_id: 'v',
      },
      { id: '3', titel: 'Lauf', datum_von: '2026-12-05T08:00', datum_bis: '2026-12-05T12:00' },
    ]);
    expect(gruppen.map((g) => g.titel)).toEqual(['Lauf', 'Markt']);
    expect(gruppen[1].schichten.map((s) => s.id)).toEqual(['1', '2']);
    expect(gruppen[1].datum_bis).toBe('2026-12-13T01:00');
  });
});
