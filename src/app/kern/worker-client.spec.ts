import { TestBed } from '@angular/core/testing';
import { WorkerClient } from './worker-client';

describe('WorkerClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sendet nur an die eigene Origin, mit Sitzung und ohne Redirects', async () => {
    const anfrage = vi.fn().mockResolvedValue(Response.json({ status: 'erreichbar' }));
    vi.stubGlobal('fetch', anfrage);
    const client = TestBed.inject(WorkerClient);
    await expect(client.json('/api/status')).resolves.toEqual({ status: 'erreichbar' });
    const [pfad, optionen] = anfrage.mock.calls[0];
    expect(pfad).toBe('/api/status');
    expect(optionen.credentials).toBe('same-origin');
    expect(optionen.redirect).toBe('error');
    expect(optionen.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(client.zustand()).toBe('erreichbar');
    expect(client.laufendeAnfragen()).toBe(0);
    await expect(client.anfragen('https://fremd.invalid/api/status')).rejects.toThrow('API-Pfad');
    expect(anfrage).toHaveBeenCalledTimes(1);
  });

  it('erkennt eine abgelaufene Sitzung', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const client = TestBed.inject(WorkerClient);
    await expect(client.anfragen('/api/status')).rejects.toThrow('Sitzung');
    expect(client.zustand()).toBe('sitzung-abgelaufen');
    expect(client.laufendeAnfragen()).toBe(0);
  });

  it('verwechselt eine HTML-Anmeldeseite nicht mit JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
        ),
    );
    await expect(TestBed.inject(WorkerClient).json('/api/status')).rejects.toThrow('API-Antwort');
  });

  it('nennt den festen Diagnosecode des Workers, aber keine fremden Kopfzeilen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { code: 'EFS_UMLEITUNG', nachricht: 'Weiterleitung' },
          {
            status: 502,
            headers: {
              'X-Stationwizard-Diagnose': 'EFS_UMLEITUNG',
              Location: 'http://fremd.invalid:1080/',
            },
          },
        ),
      ),
    );
    const client = TestBed.inject(WorkerClient);
    await expect(client.anfragen('/api/efs/checkapikey')).rejects.toThrow('EFS_UMLEITUNG');
    expect(client.fehler()).toContain('HTTP 502');
    expect(client.fehler()).not.toContain('fremd.invalid');
  });

  it('übernimmt keinen frei erfundenen Diagnosewert in die Meldung', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 502,
          headers: { 'X-Stationwizard-Diagnose': '<b>beliebiger Text</b>' },
        }),
      ),
    );
    const client = TestBed.inject(WorkerClient);
    await expect(client.anfragen('/api/status')).rejects.toThrow('HTTP 502');
    expect(client.fehler()).not.toContain('beliebiger Text');
  });

  it('zeigt Netzwerkfehler ohne technische Rohdaten', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('interne Details')));
    const client = TestBed.inject(WorkerClient);
    await expect(client.anfragen('/api/status')).rejects.toThrow('nicht erreichbar');
    expect(client.fehler()).not.toContain('interne Details');
    expect(client.zustand()).toBe('nicht-erreichbar');
  });
});
