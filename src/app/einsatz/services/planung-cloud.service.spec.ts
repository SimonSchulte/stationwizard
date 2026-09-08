import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { PlanungCloudService } from './planung-cloud.service';
import { erzeugeTestplanung } from './testing/pep-testdaten';
import { serialisierePepDatei } from './pep-datei';

describe('PlanungCloudService', () => {
  const worker = { anfragen: vi.fn(), json: vi.fn() };
  let service: PlanungCloudService;
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: WorkerClient, useValue: worker }] });
    service = TestBed.inject(PlanungCloudService);
  });

  it('legt neue Dateien geschützt gegen versehentliches Überschreiben an', async () => {
    const planung = erzeugeTestplanung();
    worker.anfragen.mockResolvedValue(
      new Response(null, { status: 201, headers: { ETag: '"neu"' } }),
    );
    await service.speichern(planung);
    const [pfad, optionen] = worker.anfragen.mock.calls[0];
    expect(pfad).toBe(`/api/nextcloud/planungen/${planung.id}`);
    expect(optionen.headers.get('If-None-Match')).toBe('*');
    expect(optionen.headers.get('If-Match')).toBeNull();
    expect(JSON.parse(optionen.body).planung).toEqual(planung);
    expect(service.hatLokaleAenderungen(planung)).toBe(false);
  });

  it('ändert die Schreibgrundlage bei bloßem Listenrefresh nicht', async () => {
    const planung = erzeugeTestplanung();
    worker.anfragen.mockResolvedValueOnce(
      new Response(serialisierePepDatei(planung), { headers: { ETag: '"geladen"' } }),
    );
    service.uebernahmeMerken(await service.laden(planung.id));
    worker.json.mockResolvedValue({ dateien: [{ id: planung.id, etag: '"fremde-aenderung"' }] });
    await service.listeLaden();
    worker.anfragen.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { ETag: '"gespeichert"' } }),
    );
    await service.speichern({ ...planung, name: 'Lokal geändert' });
    expect(worker.anfragen.mock.calls[1][1].headers.get('If-Match')).toBe('"geladen"');
    expect(planung.name).toBe('Synthetischer Übungsplan');
  });

  it('behält bei Konflikt lokale Daten und die alte Schreibgrundlage', async () => {
    const planung = erzeugeTestplanung();
    service.uebernahmeMerken({ planung, versionWarning: false, etag: '"alt"' });
    const bearbeitet = { ...planung, name: 'Ungesicherte Änderung' };
    worker.anfragen.mockRejectedValue(new WorkerFehler('Versionskonflikt', 412));
    await expect(service.speichern(bearbeitet)).rejects.toMatchObject({ status: 412 });
    expect(bearbeitet.name).toBe('Ungesicherte Änderung');
    expect(service.hatLokaleAenderungen(bearbeitet)).toBe(true);
    await expect(service.speichern(bearbeitet)).rejects.toMatchObject({ status: 412 });
    expect(worker.anfragen.mock.calls[1][1].headers.get('If-Match')).toBe('"alt"');
  });

  it('überschreibt vorhandene Dateien ohne ETag nicht blind', async () => {
    const planung = erzeugeTestplanung();
    service.uebernahmeMerken({ planung, versionWarning: false, etag: null });
    await expect(service.speichern(planung)).rejects.toThrow('Dateiversion');
    expect(worker.anfragen).not.toHaveBeenCalled();
  });

  it('weist eine fremde Dateikennung zurück und zeigt Listenfehler an', async () => {
    const planung = erzeugeTestplanung();
    worker.anfragen.mockResolvedValue(new Response(serialisierePepDatei(planung)));
    await expect(service.laden(crypto.randomUUID())).rejects.toThrow('Kennung');
    worker.json.mockResolvedValue({ dateien: [{ id: '../fremd', etag: null }] });
    await service.listeLaden();
    expect(service.listenFehler()).toContain('ungültige Liste');
    expect(service.dateien()).toEqual([]);
  });
});
