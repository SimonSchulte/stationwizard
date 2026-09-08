import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { EfsApiService } from './efs-api.service';
import { ImportService } from './import.service';

describe('EFS-Verbindung über denselben Worker', () => {
  const worker = { json: vi.fn(), zustand: signal('erreichbar') };
  let service: EfsApiService;
  beforeEach(() => {
    vi.resetAllMocks();
    worker.zustand.set('erreichbar');
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    service = TestBed.inject(EfsApiService);
  });

  it('prüft ohne Zugangsdaten und schickt nur JSON an den Worker', async () => {
    worker.json.mockResolvedValue({
      status: 'OK',
      orga: 'Testorganisation',
      hiorg_org_id: 'test-orga',
    });
    await expect(service.pruefeVerbindung()).resolves.toEqual({
      orga: 'Testorganisation',
      hiorg_org_id: 'test-orga',
    });
    expect(worker.json).toHaveBeenCalledWith('/api/efs/checkapikey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(service.erreichbar()).toBe(true);
    worker.zustand.set('nicht-erreichbar');
    expect(service.erreichbar()).toBe(false);
  });

  it('erhält Zahlenzeitpunkte, ISO-Zeiten und die Gruppierung nach Veranstaltung', async () => {
    worker.json.mockResolvedValue({
      status: 'OK',
      einsaetze: [
        { id: 2, veranstaltung_id: 10, titel: 'Übung', beginn: 60, end: 120, ort: 'Testort' },
        {
          id: 1,
          veranstaltung_id: 10,
          stichwort: 'Übung',
          datum_von: '1970-01-01T00:00:00.000Z',
          datum_bis: '1970-01-01T00:01:00.000Z',
        },
      ],
    });
    const einsaetze = await service.getVeranstaltungen();
    expect(worker.json.mock.calls[0][0]).toBe('/api/efs/getveranstaltungen');
    expect(worker.json.mock.calls[0][1].body).toBe('{}');
    expect(einsaetze[0]).toMatchObject({
      id: '2',
      veranstaltung_id: '10',
      datum_von: '1970-01-01T00:01:00.000Z',
      datum_bis: '1970-01-01T00:02:00.000Z',
    });
    const gruppen = service.groupEinsaetze(einsaetze);
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].schichten.map((schicht) => schicht.id)).toEqual(['1', '2']);
    expect(gruppen[0]).toMatchObject({
      veranstaltung_id: '10',
      datum_von: '1970-01-01T00:00:00.000Z',
      datum_bis: '1970-01-01T00:02:00.000Z',
    });
  });

  it('liest Kräfte aus der Objektmap, Mittel aus dem Array und erhält Zusatzqualifikationen', async () => {
    worker.json.mockResolvedValue({
      status: 'OK',
      id: 'test-einsatz',
      titel: 'Testdienst',
      beginn: 0,
      end: 60,
      einsatzkraefte_imeinsatz: {
        a: {
          hiorg_ek_id: 'test-person',
          vorname: 'Nord',
          nachname: 'Testperson',
          med_qual: 'Rettungssanitäter/in',
          fuehr_qual: 'Gruppenführer:in',
          fw_qual: 'Unbekannte FW-Qualifikation',
          bes_ausbild: 'Test-Zusatz',
          tel_mobil: 'TEST-TELEFON',
        },
      },
      einsatzmittel_imeinsatz: [
        { id: 7, bezeichnung: 'Testfahrzeug', funkruf: 'TEST-01', fugcode: 'test-fug' },
      ],
    });
    const detail = await service.getVeranstaltungDetail('test-einsatz');
    expect(worker.json.mock.calls[0][0]).toBe('/api/efs/getveranstaltung');
    expect(JSON.parse(worker.json.mock.calls[0][1].body)).toEqual({ id: 'test-einsatz' });
    expect(detail.einsatzkraefte).toHaveLength(1);
    const person = new ImportService().mapEfsEinsatzkraft(detail.einsatzkraefte[0]);
    expect(person).toMatchObject({
      name: 'Testperson Nord',
      hiorg_org_id: 'test-person',
      telefonnummer: 'TEST-TELEFON',
      tags: {
        taktisch: ['GF'],
        medizinisch: ['RS'],
        zusatz: ['Unbekannte FW-Qualifikation', 'Test-Zusatz'],
      },
    });
    expect(detail.einsatzmittel).toEqual([
      { id: '7', bezeichnung: 'Testfahrzeug', funkruf: 'TEST-01', fugcode: 'test-fug' },
    ]);
  });

  it.each([
    ['Erste-Hilfe', 'EH'],
    ['Sanitätshelfer/in', 'SanH'],
    ['Rettungshelfer/in', 'RH'],
    ['Rettungssanitäter/in', 'RS'],
    ['Rettungsassistent/in', 'RA'],
    ['Notfallsanitäter/in', 'NotSan'],
    ['Arzt/Ärztin', 'A'],
    ['Notarzt', 'NA'],
    ['Notarzt / Notärztin', 'NA'],
  ])('bewahrt das medizinische Mapping %s → %s', async (roh, erwartet) => {
    worker.json.mockResolvedValue({
      status: 'OK',
      einsatzkraefte_imeinsatz: { test: { med_qual: roh } },
    });
    expect((await service.getVeranstaltungDetail('test')).einsatzkraefte[0].ausbildungen).toEqual([
      erwartet,
    ]);
  });

  it.each([
    ['Helfer:in in Ausbildung', 'H'],
    ['Gruppenführer:in', 'GF'],
    ['Zugführer:in', 'ZF'],
    ['ZF mit Stabsausbildung', 'ZF'],
    ['Verbandsführer:in', 'VF'],
    ['Verbandführer:in', 'VF'],
  ])('bewahrt das taktische Mapping %s → %s', async (roh, erwartet) => {
    worker.json.mockResolvedValue({
      status: 'OK',
      einsatzkraefte_imeinsatz: { test: { fuehr_qual: roh } },
    });
    expect((await service.getVeranstaltungDetail('test')).einsatzkraefte[0].ausbildungen).toEqual([
      erwartet,
    ]);
  });

  it('erkennt den bekannten Notarzt-Text auch in bes_ausbild', async () => {
    worker.json.mockResolvedValue({
      status: 'OK',
      einsatzkraefte_imeinsatz: { test: { bes_ausbild: 'Notarzt / Notärztin' } },
    });
    const detail = await service.getVeranstaltungDetail('test');
    expect(new ImportService().mapEfsEinsatzkraft(detail.einsatzkraefte[0]).tags).toEqual({
      medizinisch: ['NA'],
    });
  });

  it('übernimmt vorhandene Fahrzeugfunkrufe aus Live-Daten ohne Stammdaten im Repository', () => {
    expect(service.matchFahrzeug({ id: 'test-fahrzeug', funkruf: ' TEST-01 ' })).toEqual({
      seriennummer: null,
      funkruf: 'TEST-01',
      hiorgId: 'test-fahrzeug',
    });
    expect(
      service.matchFahrzeug({ id: 'test-fahrzeug', bezeichnung: 'Fahrzeug ohne Funkruf' }),
    ).toBeNull();
  });

  it('zeigt API- und Verbindungsfehler statt einer scheinbar leeren Liste', async () => {
    worker.json.mockResolvedValue({ status: 'ERROR', fehler: 'EFS nicht freigegeben' });
    await expect(service.getVeranstaltungen()).rejects.toThrow('EFS nicht freigegeben');
    expect(service.verbindung()).toBe('gestoert');
    expect(service.fehler()).toBe('EFS nicht freigegeben');
    worker.json.mockRejectedValue(new WorkerFehler('Verbindung noch nicht eingerichtet', 503));
    await expect(service.getVeranstaltungen()).rejects.toThrow('noch nicht eingerichtet');
    expect(service.erreichbar()).toBe(false);
  });

  it('weist falsche Containerformen zurück', async () => {
    worker.json.mockResolvedValue({ status: 'OK', einsaetze: {} });
    await expect(service.getVeranstaltungen()).rejects.toThrow('Veranstaltungsliste');
    worker.json.mockResolvedValue({ status: 'OK', einsatzkraefte_imeinsatz: [] });
    await expect(service.getVeranstaltungDetail('test')).rejects.toThrow('Einsatzkräfteliste');
    worker.json.mockResolvedValue({ status: 'OK', einsatzmittel_imeinsatz: {} });
    await expect(service.getVeranstaltungDetail('test')).rejects.toThrow('Einsatzmittelliste');
  });
});
