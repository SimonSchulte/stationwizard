import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILBILD_PFAD, verarbeiteProfilbild } from '../src/profilbild';
import type { AccessKonfiguration } from '../src/anmeldung';

const TEAM_DOMAIN = 'https://stationwizard-test.cloudflareaccess.com';
// Frei erfundener Testwert; steht nie für ein echtes Access-JWT.
const JWT = 'erfundenes-testtoken.nur-fuer-den-test.4711';

const abrufen = vi.fn<typeof fetch>();
let umgebung: AccessKonfiguration;

function anfrage(optionen: RequestInit & { ohneToken?: boolean } = {}): Request {
  const { ohneToken, ...rest } = optionen;
  const header = new Headers(rest.headers);
  if (!ohneToken) header.set('Cf-Access-Jwt-Assertion', JWT);
  return new Request(`https://stationwizard.example${PROFILBILD_PFAD}`, {
    method: 'GET',
    ...rest,
    headers: header,
  });
}

async function inhaltVon(antwort: Response): Promise<Record<string, unknown>> {
  return (await antwort.clone().json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', abrufen);
  abrufen.mockReset();
  umgebung = { ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ACCESS_AUD: 'stationwizard-test-audience' };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Profilbild: Best-effort-Abruf über Cloudflare Access', () => {
  it('liefert die https-Bild-URL aus get-identity', async () => {
    abrufen.mockResolvedValue(
      Response.json({
        email: 'erfunden@example.invalid',
        picture: 'https://bild.example/foto.png',
      }),
    );

    const antwort = await verarbeiteProfilbild(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: 'https://bild.example/foto.png' });
  });

  it('ruft get-identity mit dem Access-JWT als Cookie ab, ohne Weiterleitung zu folgen', async () => {
    abrufen.mockResolvedValue(Response.json({}));

    await verarbeiteProfilbild(anfrage(), umgebung);

    expect(abrufen).toHaveBeenCalledExactlyOnceWith(
      `${TEAM_DOMAIN}/cdn-cgi/access/get-identity`,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: expect.objectContaining({ Cookie: `CF_Authorization=${JWT}` }) as unknown,
      }),
    );
  });

  it.each([
    ['fehlendes Feld', {}],
    ['leerer Text', { picture: '' }],
    ['kein https', { picture: 'http://bild.example/foto.png' }],
    ['keine gültige URL', { picture: 'nicht-mal-eine-url' }],
    ['falscher Typ', { picture: 42 }],
  ])('liefert null statt Fehler bei %s', async (_bezeichnung, identitaet) => {
    abrufen.mockResolvedValue(Response.json(identitaet));

    const antwort = await verarbeiteProfilbild(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
  });

  it('liefert null, wenn get-identity nicht erreichbar ist', async () => {
    abrufen.mockRejectedValue(new Error('Netzwerkfehler'));

    const antwort = await verarbeiteProfilbild(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
  });

  it('liefert null bei einer Weiterleitung, ohne ihr zu folgen', async () => {
    abrufen.mockResolvedValue(new Response(null, { status: 302 }));

    const antwort = await verarbeiteProfilbild(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
  });

  it('liefert null bei einem ablehnenden Status', async () => {
    abrufen.mockResolvedValue(new Response(null, { status: 401 }));

    const antwort = await verarbeiteProfilbild(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
  });

  it('ruft get-identity gar nicht erst auf, wenn kein Access-JWT vorliegt', async () => {
    const antwort = await verarbeiteProfilbild(anfrage({ ohneToken: true }), umgebung);

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('ruft get-identity gar nicht erst auf, wenn die Team-Domain fehlt', async () => {
    const antwort = await verarbeiteProfilbild(anfrage(), { ACCESS_TEAM_DOMAIN: undefined });

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'DELETE'])('lehnt %s ab', async (methode) => {
    const antwort = await verarbeiteProfilbild(anfrage({ method: methode }), umgebung);

    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET');
    expect(abrufen).not.toHaveBeenCalled();
  });
});
