import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verarbeiteNextcloud, type NextcloudKonfiguration } from '../src/nextcloud';

const ID = '01234567-89ab-4cde-8fab-0123456789ab';
const ANDERE_ID = '12345678-90ab-4cde-8fab-0123456789ab';
const PFAD = `/api/nextcloud/planungen/${ID}`;
const XLSX_INHALTSTYP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_INHALT = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]);

function konfiguration(): NextcloudKonfiguration {
  return {
    NEXTCLOUD_BASE_URL: 'https://cloud.example.test/nextcloud///',
    NEXTCLOUD_SHARE_TOKEN: 'test-excel-freigabe',
    NEXTCLOUD_SHARE_PASSWORD: 'test-passwort',
    NEXTCLOUD_PEP_SHARE_TOKEN: 'test-ordner-freigabe',
  };
}

function anfrage(pfad = '/api/nextcloud/arbeitsmappe', init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

function pepDatei(id = ID): string {
  return JSON.stringify({
    version: '1.0',
    meta: { exportedAt: '2026-01-01T00:00:00Z', locale: 'de-DE' },
    planung: {
      id,
      name: 'Erfundene Übungsplanung',
      start: '2026-01-01T09:00:00Z',
      end: '2026-01-01T10:00:00Z',
      posten: [],
      einsatzkraefte: [],
      einsatzleiter: null,
    },
  });
}

function schreiben(
  pfad = PFAD,
  body: BodyInit = pepDatei(),
  header: Record<string, string> = {},
): Request {
  return anfrage(pfad, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"', ...header },
    body,
  });
}

function dateiXml(
  href: string,
  { status = 'HTTP/1.1 200 OK', typ = '', etag = '&quot;v1&quot;' } = {},
): string {
  return `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:getetag>${etag}</d:getetag><d:resourcetype>${typ}</d:resourcetype></d:prop><d:status>${status}</d:status></d:propstat></d:response>`;
}

function multistatus(inhalt: string): Response {
  return new Response(`<d:multistatus xmlns:d="DAV:">${inhalt}</d:multistatus>`, {
    status: 207,
    headers: { 'Content-Type': 'application/xml' },
  });
}

describe('NextCloud-Proxy', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('liest die feste Arbeitsmappe und reicht nur Datei- und Versionsheader weiter', async () => {
    fetchMock.mockResolvedValue(
      new Response(ZIP_INHALT, {
        headers: {
          'Content-Type': 'application/octet-stream',
          ETag: '"v1"',
          'Last-Modified': 'Thu, 01 Jan 2026 00:00:00 GMT',
          'Set-Cookie': 'secret=upstream',
          'X-Nextcloud-Secret': 'nicht-weitergeben',
        },
      }),
    );
    const antwort = await verarbeiteNextcloud(anfrage(), konfiguration());
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cloud.example.test/nextcloud/public.php/webdav/',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa('test-excel-freigabe:test-passwort')}`,
          'X-Requested-With': 'XMLHttpRequest',
        }),
      }),
    );
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe(XLSX_INHALTSTYP);
    expect(antwort.headers.get('ETag')).toBe('"v1"');
    expect(antwort.headers.get('Last-Modified')).toBe('Thu, 01 Jan 2026 00:00:00 GMT');
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(antwort.headers.has('Set-Cookie')).toBe(false);
    expect(antwort.headers.has('X-Nextcloud-Secret')).toBe(false);
    expect(new Uint8Array(await antwort.arrayBuffer())).toEqual(ZIP_INHALT);
  });

  it('löst Secrets-Store-Bindings mit get() auf und unterstützt UTF-8-Passwörter', async () => {
    const basisLesen = vi.fn().mockResolvedValue('https://cloud.example.test');
    const tokenLesen = vi.fn().mockResolvedValue('test-freigabe');
    const passwortLesen = vi.fn().mockResolvedValue('übung');
    fetchMock.mockResolvedValue(new Response(ZIP_INHALT));
    const antwort = await verarbeiteNextcloud(anfrage(), {
      NEXTCLOUD_BASE_URL: { get: basisLesen },
      NEXTCLOUD_SHARE_TOKEN: { get: tokenLesen },
      NEXTCLOUD_SHARE_PASSWORD: { get: passwortLesen },
    });
    expect(antwort.status).toBe(200);
    expect(basisLesen).toHaveBeenCalledOnce();
    expect(tokenLesen).toHaveBeenCalledOnce();
    expect(passwortLesen).toHaveBeenCalledOnce();
    const aufruf = fetchMock.mock.calls[0]!;
    expect(new Headers(aufruf[1]?.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from('test-freigabe:übung').toString('base64')}`,
    );
  });

  it.each(['NEXTCLOUD_BASE_URL', 'NEXTCLOUD_SHARE_TOKEN', 'NEXTCLOUD_SHARE_PASSWORD'] as const)(
    'sperrt bei nicht auflösbarem Secret %s',
    async (name) => {
      const env = konfiguration();
      env[name] = { get: vi.fn().mockRejectedValue(new Error('geheime-detailinformationen')) };
      const antwort = await verarbeiteNextcloud(anfrage(), env);
      expect(antwort.status).toBe(503);
      expect(await antwort.text()).not.toContain('geheime-detailinformationen');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'http://cloud.example.test',
    'https://nutzer:pass@cloud.example.test',
    'https://cloud.example.test/?target=x',
    'https://cloud.example.test/#x',
    ' https://cloud.example.test',
    'keine-url',
  ])('lehnt ungültige Basis-URL %s ab', async (basis) => {
    const antwort = await verarbeiteNextcloud(anfrage(), {
      ...konfiguration(),
      NEXTCLOUD_BASE_URL: basis,
    });
    expect(antwort.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '/api/nextcloud',
    '/api/nextcloud/arbeitsmappe/anders',
    '/api/nextcloud/arbeitsmappe?url=https://fremd.test',
    '/api/nextcloud/planungen/unbekannt',
    `/api/nextcloud/planungen/${ID}.pep.json`,
    `/api/nextcloud/planungen/%2f${ID}`,
    `/api/nextcloud/planungen/${ID}/..%2fprivate`,
    `/api/nextcloud/planungen/${ID}?pfad=anderer`,
  ])('lehnt freie Pfade und Query-Parameter ab: %s', async (pfad) => {
    const antwort = await verarbeiteNextcloud(anfrage(pfad), konfiguration());
    expect(antwort.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['POST', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'])(
    'erlaubt keine Methode %s',
    async (method) => {
      const antwort = await verarbeiteNextcloud(anfrage(PFAD, { method }), konfiguration());
      expect(antwort.status).toBe(405);
      expect(antwort.headers.get('Allow')).toBe('GET, PUT');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('erlaubt auf der Dateiliste nur GET', async () => {
    const antwort = await verarbeiteNextcloud(
      schreiben('/api/nextcloud/planungen'),
      konfiguration(),
    );
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET');
  });

  it('verhindert unbedingtes Überschreiben', async () => {
    const antwort = await verarbeiteNextcloud(
      anfrage(PFAD, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: pepDatei(),
      }),
      konfiguration(),
    );
    expect(antwort.status).toBe(428);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { 'If-Match': '*' },
    { 'If-Match': 'W/"v1"' },
    { 'If-Match': '"v1", "v2"' },
    { 'If-Match': 'ungültig' },
    { 'If-None-Match': '"v1"' },
    { 'If-None-Match': '*' },
  ])('lehnt ungültige/kombinierte Vorbedingungen ab: %j', async (header) => {
    const antwort = await verarbeiteNextcloud(schreiben(PFAD, pepDatei(), header), konfiguration());
    expect(antwort.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('legt eine neue PEP-Datei ausschließlich im freigegebenen Ordner an', async () => {
    fetchMock.mockResolvedValue(
      new Response('Interne HTML-Bestätigung', { status: 201, headers: { ETag: '"v2"' } }),
    );
    const antwort = await verarbeiteNextcloud(
      anfrage(PFAD, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'If-None-Match': '*' },
        body: pepDatei(),
      }),
      konfiguration(),
    );
    expect(antwort.status).toBe(204);
    expect(await antwort.text()).toBe('');
    expect(antwort.headers.get('ETag')).toBe('"v2"');
    const [ziel, init] = fetchMock.mock.calls[0]!;
    expect(ziel).toBe(`https://cloud.example.test/nextcloud/public.php/webdav/${ID}.pep.json`);
    expect(new Headers(init?.headers).get('If-None-Match')).toBe('*');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${btoa('test-ordner-freigabe:')}`,
    );
    expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe(pepDatei());
  });

  it('speichert eine Arbeitsmappe mit Dateiversionsprüfung', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const antwort = await verarbeiteNextcloud(
      schreiben('/api/nextcloud/arbeitsmappe', ZIP_INHALT, { 'Content-Type': XLSX_INHALTSTYP }),
      konfiguration(),
    );
    expect(antwort.status).toBe(204);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('If-Match')).toBe('"v1"');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Content-Type')).toBe(
      XLSX_INHALTSTYP,
    );
  });

  it.each([
    [PFAD, 'text/plain'],
    ['/api/nextcloud/arbeitsmappe', 'application/json'],
  ])('prüft den Inhaltstyp vor dem Upload (%s)', async (pfad, typ) => {
    const antwort = await verarbeiteNextcloud(
      schreiben(pfad, pepDatei(), { 'Content-Type': typ! }),
      konfiguration(),
    );
    expect(antwort.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '{}',
    '[{}]',
    'kein-json',
    pepDatei(ANDERE_ID),
    JSON.stringify({ version: '1.0', meta: {}, planung: { id: ID } }),
  ])('lehnt ungültige PEP-Struktur und falsche Planungs-ID ab', async (inhalt) => {
    const antwort = await verarbeiteNextcloud(schreiben(PFAD, inhalt), konfiguration());
    expect(antwort.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lehnt HTML als Arbeitsmappe ab', async () => {
    const antwort = await verarbeiteNextcloud(
      schreiben('/api/nextcloud/arbeitsmappe', '<html>Anmeldung</html>', {
        'Content-Type': XLSX_INHALTSTYP,
      }),
      konfiguration(),
    );
    expect(antwort.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'begrenzt PEP-Uploads auch ohne ehrliche Content-Length (%s)',
    async (mitLaenge) => {
      const header: Record<string, string> = mitLaenge
        ? { 'Content-Length': String(2 * 1024 * 1024 + 1) }
        : {};
      const antwort = await verarbeiteNextcloud(
        schreiben(PFAD, 'x'.repeat(2 * 1024 * 1024 + 1), header),
        konfiguration(),
      );
      expect(antwort.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('begrenzt Excel-Uploads auf 15 MiB', async () => {
    const antwort = await verarbeiteNextcloud(
      schreiben('/api/nextcloud/arbeitsmappe', ZIP_INHALT, {
        'Content-Type': XLSX_INHALTSTYP,
        'Content-Length': String(15 * 1024 * 1024 + 1),
      }),
      konfiguration(),
    );
    expect(antwort.status).toBe(413);
  });

  it('liest PEP ohne die gespeicherte Versionsangabe umzuschreiben', async () => {
    const inhalt = pepDatei().replace('"version":"1.0"', '"version":"0.9"');
    fetchMock.mockResolvedValue(new Response(inhalt, { headers: { ETag: '"v1"' } }));
    const antwort = await verarbeiteNextcloud(anfrage(PFAD), konfiguration());
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(await antwort.text()).toBe(inhalt);
  });

  it.each([401, 403, 404, 412, 500, 302])('sanitisiert NextCloud-Fehler %s', async (status) => {
    fetchMock.mockResolvedValue(
      new Response('https://privater-server.test Token=sehr-geheim', {
        status,
        headers: { 'WWW-Authenticate': 'geheime-details', Location: 'https://fremd.test' },
      }),
    );
    const antwort = await verarbeiteNextcloud(anfrage(PFAD), konfiguration());
    expect(antwort.status).toBe(status === 404 || status === 412 ? status : 502);
    expect(antwort.headers.has('WWW-Authenticate')).toBe(false);
    expect(antwort.headers.has('Location')).toBe(false);
    const json = (await antwort.json()) as { code: string };
    if (status === 401 || status === 403) expect(json.code).toBe('NEXTCLOUD_ZUGANG_ABGELEHNT');
    expect(JSON.stringify(json)).not.toMatch(/geheim|privater-server/);
  });

  it('reicht Fetch-Fehler samt Redirect-Ziel nicht weiter', async () => {
    fetchMock.mockRejectedValue(new Error('Redirect zu https://secret.example/token'));
    const antwort = await verarbeiteNextcloud(anfrage(PFAD), konfiguration());
    expect(antwort.status).toBe(502);
    expect(await antwort.text()).not.toMatch(/secret|token/);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('error');
  });

  it('bricht langsame Upstream-Anfragen nach 30 Sekunden ab', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_ziel, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('abgebrochen')), {
            once: true,
          });
        }),
    );
    const ergebnis = verarbeiteNextcloud(anfrage(PFAD), konfiguration());
    await vi.advanceTimersByTimeAsync(30_001);
    const antwort = await ergebnis;
    expect(antwort.status).toBe(504);
  });

  it('bricht auch langsame Uploadstreams vor dem NextCloud-Aufruf ab', async () => {
    vi.useFakeTimers();
    const init: RequestInit & { duplex: string } = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"' },
      body: new ReadableStream({ start() {} }),
      duplex: 'half',
    };
    const ergebnis = verarbeiteNextcloud(anfrage(PFAD, init), konfiguration());
    await vi.advanceTimersByTimeAsync(30_001);
    const antwort = await ergebnis;
    expect(antwort.status).toBe(408);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bricht auch langsames Lesen eines Antwortstreams ab', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start() {} })));
    const ergebnis = verarbeiteNextcloud(anfrage(PFAD), konfiguration());
    await vi.advanceTimersByTimeAsync(30_001);
    const antwort = await ergebnis;
    expect(antwort.status).toBe(504);
  });

  it.each([PFAD, '/api/nextcloud/planungen', '/api/nextcloud/arbeitsmappe'])(
    'begrenzt Antwortgrößen auch ohne Content-Length (%s)',
    async (pfad) => {
      const grenze = pfad.endsWith('arbeitsmappe') ? 15 * 1024 * 1024 : 2 * 1024 * 1024;
      fetchMock.mockResolvedValue(
        new Response(new Uint8Array(grenze + 1), {
          status: pfad.endsWith('planungen') ? 207 : 200,
        }),
      );
      const antwort = await verarbeiteNextcloud(anfrage(pfad), konfiguration());
      expect(antwort.status).toBe(502);
      expect(((await antwort.json()) as { code: string }).code).toBe('NEXTCLOUD_ANTWORT_ZU_GROSS');
    },
  );

  it.each([PFAD, '/api/nextcloud/arbeitsmappe'])(
    'verhindert HTML-Loginseiten im erfolgreichen Dateiabruf (%s)',
    async (pfad) => {
      fetchMock.mockResolvedValue(new Response('<html>Interne Anmeldeseite</html>'));
      const antwort = await verarbeiteNextcloud(anfrage(pfad), konfiguration());
      expect(antwort.status).toBe(502);
      expect(await antwort.text()).not.toContain('Interne Anmeldeseite');
    },
  );

  it('fordert per PROPFIND Depth 1 nur Dateieigenschaften an und filtert die Liste', async () => {
    const verzeichnis = '/nextcloud/public.php/webdav/';
    fetchMock.mockResolvedValue(
      multistatus(
        [
          dateiXml(`${verzeichnis}${ID}.pep.json`),
          dateiXml(`${verzeichnis}${ANDERE_ID}.pep.json`, { status: 'HTTP/1.1 404 Not Found' }),
          dateiXml(verzeichnis, { typ: '<d:collection/>' }),
          dateiXml(`${verzeichnis}ordner.pep.json`, { typ: '<d:collection/>' }),
          dateiXml(`${verzeichnis}private.xlsx`),
          dateiXml(`${verzeichnis}frei-gewaehlt.pep.json`),
          dateiXml(`${verzeichnis}tiefer/${ANDERE_ID}.pep.json`),
          dateiXml(`https://fremd.example.test${verzeichnis}${ANDERE_ID}.pep.json`),
          dateiXml(`${verzeichnis}${ANDERE_ID}.pep.json?token=secret`),
          dateiXml(`${verzeichnis}${ANDERE_ID}.pep.json`, { typ: '<d:collection/>' }),
        ].join(''),
      ),
    );
    const antwort = await verarbeiteNextcloud(anfrage('/api/nextcloud/planungen'), konfiguration());
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ dateien: [{ id: ID, etag: '"v1"' }] });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('PROPFIND');
    expect(new Headers(init?.headers).get('Depth')).toBe('1');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${btoa('test-ordner-freigabe:')}`,
    );
    expect(init?.body).toContain('<d:resourcetype/>');
  });

  it('berücksichtigt getrennte propstat-Blöcke und ignoriert fehlerhafte ETags', async () => {
    fetchMock.mockResolvedValue(
      multistatus(
        `<d:response><d:href>${ID}.pep.json</d:href><d:propstat><d:prop><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:getetag>&quot;secret&quot;</d:getetag></d:prop><d:status>HTTP/1.1 403 Forbidden</d:status></d:propstat></d:response>`,
      ),
    );
    const antwort = await verarbeiteNextcloud(anfrage('/api/nextcloud/planungen'), konfiguration());
    expect(await antwort.json()).toEqual({ dateien: [{ id: ID, etag: null }] });
  });

  it('gibt für einen leeren freigegebenen Ordner eine leere Liste zurück', async () => {
    fetchMock.mockResolvedValue(
      multistatus(dateiXml('/nextcloud/public.php/webdav/', { typ: '<d:collection/>' })),
    );
    const antwort = await verarbeiteNextcloud(anfrage('/api/nextcloud/planungen'), konfiguration());
    expect(await antwort.json()).toEqual({ dateien: [] });
  });

  it.each([
    '<!DOCTYPE d:multistatus [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><d:multistatus xmlns:d="DAV:">&xxe;</d:multistatus>',
    '<!ENTITY xxe "secret"><d:multistatus xmlns:d="DAV:"/>',
    '<d:multistatus xmlns:d="DAV:"><kaputt></d:multistatus>',
    '<html>Interne Anmeldung</html>',
  ])('weist DTD/Entities und ungültige XML-Listen zurück', async (xml) => {
    fetchMock.mockResolvedValue(new Response(xml, { status: 207 }));
    const antwort = await verarbeiteNextcloud(anfrage('/api/nextcloud/planungen'), konfiguration());
    expect(antwort.status).toBe(502);
    expect(await antwort.text()).not.toMatch(/passwd|secret|Interne Anmeldung/);
  });

  it('akzeptiert bei der Liste nur den WebDAV-Multistatus', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Anmeldung</html>'));
    const antwort = await verarbeiteNextcloud(anfrage('/api/nextcloud/planungen'), konfiguration());
    expect(antwort.status).toBe(502);
  });
});
