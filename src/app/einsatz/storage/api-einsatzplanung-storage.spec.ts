import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { testEinsatz, testVorbereitung, testVorlage } from '../testing/vb-testdaten';
import { ApiEinsatzStorage } from './api-einsatz-storage';
import { ApiVbVorlagenStorage } from './api-vb-vorlagen-storage';
import { ApiVorbereitungStorage } from './api-vorbereitung-storage';
import {
  EinsatzplanungBereitsVorhandenFehler,
  EinsatzplanungKonfliktFehler,
} from './einsatzplanung-fehler';

function json(inhalt: unknown, etag = '"1"', status = 200): Response {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: { 'Content-Type': 'application/json', ETag: etag },
  });
}

describe('Api-Adapter der Einsatzplanung', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
  });

  describe('ApiEinsatzStorage', () => {
    it('filtert die Liste mit der Prüfung und puffert sie bis zum nächsten Schreiben', async () => {
      const storage = TestBed.inject(ApiEinsatzStorage);
      const eintrag = { ...testEinsatz(), version: 1, vb: null };
      worker.json.mockResolvedValue({ einsaetze: [eintrag, { kaputt: true }] });
      expect(await storage.ladeEinsaetze()).toEqual([eintrag]);
      await storage.ladeEinsaetze();
      expect(worker.json).toHaveBeenCalledOnce();
      expect(worker.json.mock.calls[0][0]).toBe('/api/einsatzplanung/einsaetze');

      worker.anfragen.mockResolvedValue(
        new Response(null, { status: 201, headers: { ETag: '"1"' } }),
      );
      await storage.legeEinsatzAn(testEinsatz());
      await storage.ladeEinsaetze();
      expect(worker.json).toHaveBeenCalledTimes(2);
    });

    it('wirft bei einer Antwort ohne Liste', async () => {
      worker.json.mockResolvedValue({ anderes: [] });
      await expect(TestBed.inject(ApiEinsatzStorage).ladeEinsaetze()).rejects.toThrow(
        /ungültige Liste/,
      );
    });

    it('lädt einzeln ungepuffert mit ETag und liefert bei 404 null', async () => {
      const storage = TestBed.inject(ApiEinsatzStorage);
      const einsatz = testEinsatz();
      worker.anfragen.mockResolvedValueOnce(json(einsatz, '"1"'));
      worker.anfragen.mockResolvedValueOnce(json(einsatz, '"2"'));
      expect((await storage.ladeEinsatz(einsatz.id))?.version).toBe('"1"');
      expect((await storage.ladeEinsatz(einsatz.id))?.version).toBe('"2"');
      worker.anfragen.mockRejectedValueOnce(new WorkerFehler('weg', 404));
      expect(await storage.ladeEinsatz(einsatz.id)).toBeNull();
    });

    it('weist eine ungültige Einzelantwort ab', async () => {
      worker.anfragen.mockResolvedValue(json({ id: 'x' }));
      await expect(TestBed.inject(ApiEinsatzStorage).ladeEinsatz('x')).rejects.toThrow(
        /ungültiger Form/,
      );
    });

    it('legt mit POST und If-None-Match an, speichert mit PUT und If-Match', async () => {
      const storage = TestBed.inject(ApiEinsatzStorage);
      const einsatz = testEinsatz();
      worker.anfragen.mockResolvedValue(
        new Response(null, { status: 201, headers: { ETag: '"1"' } }),
      );
      expect(await storage.legeEinsatzAn(einsatz)).toBe('"1"');
      let [pfad, optionen] = worker.anfragen.mock.calls[0];
      expect(pfad).toBe('/api/einsatzplanung/einsaetze');
      expect(optionen.method).toBe('POST');
      expect(optionen.headers.get('If-None-Match')).toBe('*');
      expect(JSON.parse(optionen.body)).toEqual(einsatz);

      worker.anfragen.mockResolvedValue(new Response(null, { headers: { ETag: '"2"' } }));
      expect(await storage.speichereEinsatz(einsatz, '"1"')).toBe('"2"');
      [pfad, optionen] = worker.anfragen.mock.calls[1];
      expect(pfad).toBe(`/api/einsatzplanung/einsaetze/${einsatz.id}`);
      expect(optionen.method).toBe('PUT');
      expect(optionen.headers.get('If-Match')).toBe('"1"');
    });

    it('übersetzt 412 und 409', async () => {
      const storage = TestBed.inject(ApiEinsatzStorage);
      worker.anfragen.mockRejectedValueOnce(new WorkerFehler('alt', 412));
      await expect(storage.speichereEinsatz(testEinsatz(), '"1"')).rejects.toBeInstanceOf(
        EinsatzplanungKonfliktFehler,
      );
      worker.anfragen.mockRejectedValueOnce(
        new WorkerFehler('vergeben', 409, 'EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN'),
      );
      const fehler = await storage.legeEinsatzAn(testEinsatz()).catch((e: unknown) => e);
      expect(fehler).toBeInstanceOf(EinsatzplanungBereitsVorhandenFehler);
      expect((fehler as EinsatzplanungBereitsVorhandenFehler).code).toBe(
        'EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN',
      );
    });

    it('reicht andere Fehler unverändert durch', async () => {
      const fehler = new WorkerFehler('kaputt', 500);
      worker.anfragen.mockRejectedValue(fehler);
      await expect(
        TestBed.inject(ApiEinsatzStorage).speichereEinsatz(testEinsatz(), '"1"'),
      ).rejects.toBe(fehler);
    });
  });

  describe('ApiVorbereitungStorage', () => {
    it('adressiert …/einsaetze/<id>/vb mit den richtigen Vorbedingungen', async () => {
      const storage = TestBed.inject(ApiVorbereitungStorage);
      const einsatzId = crypto.randomUUID();
      const vorbereitung = testVorbereitung();
      worker.anfragen.mockResolvedValue(
        new Response(null, { status: 201, headers: { ETag: '"1"' } }),
      );
      await storage.legeVorbereitungAn(einsatzId, vorbereitung);
      let [pfad, optionen] = worker.anfragen.mock.calls[0];
      expect(pfad).toBe(`/api/einsatzplanung/einsaetze/${einsatzId}/vb`);
      expect(optionen.method).toBe('PUT');
      expect(optionen.headers.get('If-None-Match')).toBe('*');

      worker.anfragen.mockResolvedValue(new Response(null, { headers: { ETag: '"2"' } }));
      await storage.speichereVorbereitung(einsatzId, vorbereitung, '"1"');
      [pfad, optionen] = worker.anfragen.mock.calls[1];
      expect(optionen.headers.get('If-Match')).toBe('"1"');

      worker.anfragen.mockResolvedValue(new Response(null, { status: 204 }));
      await storage.loescheVorbereitung(einsatzId, '"2"');
      [pfad, optionen] = worker.anfragen.mock.calls[2];
      expect(optionen.method).toBe('DELETE');
      expect(new Headers(optionen.headers).get('If-Match')).toBe('"2"');
    });

    it('liefert bei 404 null und lädt sonst Vorbereitung mit Version', async () => {
      const storage = TestBed.inject(ApiVorbereitungStorage);
      worker.anfragen.mockRejectedValueOnce(new WorkerFehler('keine', 404));
      expect(await storage.ladeVorbereitung('x')).toBeNull();
      const vorbereitung = testVorbereitung();
      worker.anfragen.mockResolvedValueOnce(json(vorbereitung, '"4"'));
      expect(await storage.ladeVorbereitung('x')).toEqual({ daten: vorbereitung, version: '"4"' });
    });

    it('verwirft nach dem Schreiben die Einsatzliste (VB-Kennzahlen)', async () => {
      const einsaetze = TestBed.inject(ApiEinsatzStorage);
      const storage = TestBed.inject(ApiVorbereitungStorage);
      worker.json.mockResolvedValue({ einsaetze: [] });
      await einsaetze.ladeEinsaetze();
      worker.anfragen.mockResolvedValue(new Response(null, { headers: { ETag: '"2"' } }));
      await storage.speichereVorbereitung('e', testVorbereitung(), '"1"');
      await einsaetze.ladeEinsaetze();
      expect(worker.json).toHaveBeenCalledTimes(2);
    });

    it('übersetzt 412 beim Speichern', async () => {
      worker.anfragen.mockRejectedValue(new WorkerFehler('alt', 412));
      await expect(
        TestBed.inject(ApiVorbereitungStorage).speichereVorbereitung(
          'e',
          testVorbereitung(),
          '"1"',
        ),
      ).rejects.toBeInstanceOf(EinsatzplanungKonfliktFehler);
    });
  });

  describe('ApiVbVorlagenStorage', () => {
    it('lädt Kopfdaten gefiltert und gepuffert, Einzelabruf ungepuffert', async () => {
      const storage = TestBed.inject(ApiVbVorlagenStorage);
      const kopf = {
        id: crypto.randomUUID(),
        titel: 'V',
        version: 1,
        abschnitte: 1,
        laufzettel: 1,
        positionen: 1,
        geaendertAm: '2026-01-01T00:00:00.000Z',
      };
      worker.json.mockResolvedValue({ vorlagen: [kopf, 7] });
      expect(await storage.ladeVorlagen()).toEqual([kopf]);
      await storage.ladeVorlagen();
      expect(worker.json).toHaveBeenCalledOnce();
      expect(worker.json.mock.calls[0][0]).toBe('/api/einsatzplanung/vb-vorlagen');

      const vorlage = testVorlage();
      worker.anfragen.mockResolvedValueOnce(json(vorlage, '"1"'));
      worker.anfragen.mockResolvedValueOnce(json(vorlage, '"2"'));
      await storage.ladeVorlage(vorlage.id);
      expect((await storage.ladeVorlage(vorlage.id))?.version).toBe('"2"');
    });

    it('legt an, speichert und löscht mit den richtigen Pfaden und Köpfen', async () => {
      const storage = TestBed.inject(ApiVbVorlagenStorage);
      const vorlage = testVorlage();
      worker.anfragen.mockResolvedValue(
        new Response(null, { status: 201, headers: { ETag: '"1"' } }),
      );
      await storage.legeVorlageAn(vorlage);
      expect(worker.anfragen.mock.calls[0][0]).toBe('/api/einsatzplanung/vb-vorlagen');
      expect(worker.anfragen.mock.calls[0][1].headers.get('If-None-Match')).toBe('*');
      await storage.speichereVorlage(vorlage, '"1"');
      expect(worker.anfragen.mock.calls[1][0]).toBe(
        `/api/einsatzplanung/vb-vorlagen/${vorlage.id}`,
      );
      expect(worker.anfragen.mock.calls[1][1].headers.get('If-Match')).toBe('"1"');
      worker.anfragen.mockResolvedValue(new Response(null, { status: 204 }));
      await storage.loescheVorlage(vorlage.id, '"1"');
      expect(worker.anfragen.mock.calls[2][1].method).toBe('DELETE');
    });

    it('verwirft die Liste nach dem Schreiben', async () => {
      const storage = TestBed.inject(ApiVbVorlagenStorage);
      worker.json.mockResolvedValue({ vorlagen: [] });
      await storage.ladeVorlagen();
      worker.anfragen.mockResolvedValue(new Response(null, { headers: { ETag: '"2"' } }));
      await storage.speichereVorlage(testVorlage(), '"1"');
      await storage.ladeVorlagen();
      expect(worker.json).toHaveBeenCalledTimes(2);
    });
  });
});
