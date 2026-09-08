import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../../kern/worker-client';
import { NextcloudWorkerStorage } from './nextcloud-worker.storage';

const ARBEITSMAPPEN_TYP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DATEI = new Uint8Array([80, 75, 3, 4]).buffer;

function arbeitsmappe(etag: string | null = '"stand-1"'): Response {
  const headers = new Headers({ 'Content-Type': ARBEITSMAPPEN_TYP });
  if (etag) headers.set('ETag', etag);
  return new Response(DATEI, { headers });
}

describe('NextcloudWorkerStorage', () => {
  let abruf: ReturnType<typeof vi.fn<typeof fetch>>;
  let storage: NextcloudWorkerStorage;

  beforeEach(() => {
    abruf = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', abruf);
    storage = new NextcloudWorkerStorage(new WorkerClient());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lädt Binärdaten über dieselbe Origin ohne NextCloud-Zugangsdaten im Request', async () => {
    const antwort = arbeitsmappe();
    antwort.headers.set('Content-Disposition', "attachment; filename*=UTF-8''Ausbildungsplan.xlsx");
    abruf.mockResolvedValueOnce(antwort);

    const inhalt = await storage.laden();

    expect(new Uint8Array(inhalt.daten)).toEqual(new Uint8Array(DATEI));
    expect(inhalt.dateiname).toBe('Ausbildungsplan.xlsx');
    expect(storage.bezeichnung).toBe('NextCloud · Ausbildungsplan.xlsx');
    expect(abruf.mock.calls[0][0]).toBe('/api/nextcloud/arbeitsmappe');
    const optionen = abruf.mock.calls[0][1]!;
    expect(optionen).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const headers = new Headers(optionen.headers);
    expect([...headers.keys()]).toEqual(['accept', 'x-requested-with']);
  });

  it('schreibt nur den geladenen Stand und übernimmt das neue ETag für weitere Änderungen', async () => {
    abruf
      .mockResolvedValueOnce(arbeitsmappe())
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { ETag: '"stand-2"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { ETag: '"stand-3"' } }));

    await storage.laden();
    await storage.speichern(DATEI);
    await storage.speichern(DATEI);

    const erstesSpeichern = abruf.mock.calls[1];
    expect(erstesSpeichern[0]).toBe('/api/nextcloud/arbeitsmappe');
    expect(erstesSpeichern[1]).toMatchObject({ method: 'PUT', body: DATEI });
    expect(new Headers(erstesSpeichern[1]?.headers).get('Content-Type')).toBe(ARBEITSMAPPEN_TYP);
    expect(new Headers(erstesSpeichern[1]?.headers).get('If-Match')).toBe('"stand-1"');
    expect(new Headers(abruf.mock.calls[2][1]?.headers).get('If-Match')).toBe('"stand-2"');
  });

  it('zeigt einen Konflikt an und sendet ohne erneutes Laden keinen weiteren Schreibversuch', async () => {
    abruf
      .mockResolvedValueOnce(arbeitsmappe())
      .mockResolvedValueOnce(new Response(null, { status: 412 }));

    await storage.laden();
    await expect(storage.speichern(DATEI)).rejects.toMatchObject({
      status: 412,
      message: expect.stringContaining('zwischenzeitlich geändert'),
    });
    await expect(storage.speichern(DATEI)).rejects.toThrow('zuerst neu laden');
    expect(abruf).toHaveBeenCalledTimes(2);
  });

  it.each([null, 'W/"stand-1"', '*', 'stand-1'])(
    'verhindert ungeschütztes Überschreiben bei fehlendem oder ungeeignetem ETag %s',
    async (etag) => {
      abruf.mockResolvedValueOnce(arbeitsmappe(etag));
      await storage.laden();

      await expect(storage.speichern(DATEI)).rejects.toThrow('keinen gültigen Änderungsstand');
      expect(abruf).toHaveBeenCalledTimes(1);
    },
  );

  it('verlangt nach einer Speicherantwort ohne ETag einen neu geladenen Stand', async () => {
    abruf
      .mockResolvedValueOnce(arbeitsmappe())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(arbeitsmappe('"stand-2"'))
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { ETag: '"stand-3"' } }));

    await storage.laden();
    await storage.speichern(DATEI);
    await expect(storage.speichern(DATEI)).rejects.toThrow('zuerst neu laden');
    await storage.laden();
    await storage.speichern(DATEI);

    expect(new Headers(abruf.mock.calls[3][1]?.headers).get('If-Match')).toBe('"stand-2"');
  });

  it('wiederholt einen möglicherweise bereits ausgeführten Schreibvorgang nach Netzwerkfehler nicht blind', async () => {
    abruf
      .mockResolvedValueOnce(arbeitsmappe())
      .mockRejectedValueOnce(new TypeError('Verbindung unterbrochen'));

    await storage.laden();
    await expect(storage.speichern(DATEI)).rejects.toThrow('Server ist nicht erreichbar');
    await expect(storage.speichern(DATEI)).rejects.toThrow('zuerst neu laden');
    expect(abruf).toHaveBeenCalledTimes(2);
  });

  it('behandelt eine HTML-Anmeldeseite nicht als Arbeitsmappe', async () => {
    abruf.mockResolvedValueOnce(
      new Response('<html>Anmelden</html>', { headers: { 'Content-Type': 'text/html' } }),
    );

    await expect(storage.laden()).rejects.toThrow('keine Excel-Arbeitsmappe');
  });
});
