import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILBILD_PFAD, verarbeiteProfilbild } from '../src/profilbild';

const ANWENDUNGS_ORIGIN = 'https://stationwizard.example';
// Frei erfundener Testwert; steht nie für ein echtes Access-JWT.
const JWT = 'erfundenes-testtoken.nur-fuer-den-test.4711';

const abrufen = vi.fn<typeof fetch>();
const protokollieren = vi.fn();

function anfrage(optionen: RequestInit & { ohneToken?: boolean } = {}): Request {
  const { ohneToken, ...rest } = optionen;
  const header = new Headers(rest.headers);
  if (!ohneToken) header.set('Cf-Access-Jwt-Assertion', JWT);
  return new Request(`${ANWENDUNGS_ORIGIN}${PROFILBILD_PFAD}`, {
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
  protokollieren.mockReset();
  vi.spyOn(console, 'error').mockImplementation(protokollieren);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Profilbild: Best-effort-Abruf über Cloudflare Access', () => {
  it('liefert die https-Bild-URL aus oidc_fields.picture', async () => {
    abrufen.mockResolvedValue(
      Response.json({
        email: 'erfunden@example.invalid',
        oidc_fields: { picture: 'https://bild.example/foto.png' },
      }),
    );

    const antwort = await verarbeiteProfilbild(anfrage());

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: 'https://bild.example/foto.png' });
  });

  it('ruft get-identity auf der eigenen Anwendungs-Domain mit dem Access-JWT als Cookie ab, ohne Weiterleitung zu folgen', async () => {
    // Ein serverseitiger Aufruf gegen die Team-Domain mit dem app-gebundenen JWT
    // als nachgebautem Cookie lieferte in der Praxis kein oidc_fields (siehe
    // CLAUDE.md); erst die eigene Anwendungs-Domain tat es zuverlässig.
    abrufen.mockResolvedValue(Response.json({}));

    await verarbeiteProfilbild(anfrage());

    expect(abrufen).toHaveBeenCalledExactlyOnceWith(
      `${ANWENDUNGS_ORIGIN}/cdn-cgi/access/get-identity`,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: expect.objectContaining({ Cookie: `CF_Authorization=${JWT}` }) as unknown,
      }),
    );
  });

  it.each([
    ['fehlendes oidc_fields', {}],
    ['fehlendes picture-Feld', { oidc_fields: {} }],
    ['picture nicht verschachtelt', { picture: 'https://bild.example/foto.png' }],
    ['leerer Text', { oidc_fields: { picture: '' } }],
    ['kein https', { oidc_fields: { picture: 'http://bild.example/foto.png' } }],
    ['keine gültige URL', { oidc_fields: { picture: 'nicht-mal-eine-url' } }],
    ['falscher Typ', { oidc_fields: { picture: 42 } }],
    ['oidc_fields falscher Typ', { oidc_fields: 'https://bild.example/foto.png' }],
  ])('liefert null statt Fehler bei %s', async (_bezeichnung, identitaet) => {
    abrufen.mockResolvedValue(Response.json(identitaet));

    const antwort = await verarbeiteProfilbild(anfrage());

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
  });

  it('liefert null, wenn get-identity nicht erreichbar ist', async () => {
    abrufen.mockRejectedValue(new Error('Netzwerkfehler'));

    const antwort = await verarbeiteProfilbild(anfrage());

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
  });

  it('liefert null bei einer Weiterleitung, ohne ihr zu folgen, und protokolliert nur Status/Ziel-Host', async () => {
    abrufen.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: `${ANWENDUNGS_ORIGIN}/cdn-cgi/access/login` },
      }),
    );

    const antwort = await verarbeiteProfilbild(anfrage());

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
    expect(protokollieren).toHaveBeenCalledWith(
      'PROFILBILD_ABRUF_FEHLGESCHLAGEN',
      302,
      'stationwizard.example',
    );
  });

  it('liefert null bei einem ablehnenden Status', async () => {
    abrufen.mockResolvedValue(new Response(null, { status: 401 }));

    const antwort = await verarbeiteProfilbild(anfrage());

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
    expect(protokollieren).toHaveBeenCalledWith('PROFILBILD_ABRUF_FEHLGESCHLAGEN', 401, undefined);
  });

  it('protokolliert bei fehlendem Bildfeld nur Feldnamen, nie echte Personendaten', async () => {
    abrufen.mockResolvedValue(
      Response.json({ name: 'Max Mustermann', email: 'max@example.invalid' }),
    );

    await verarbeiteProfilbild(anfrage());

    expect(protokollieren).toHaveBeenCalledWith('PROFILBILD_FELD_FEHLT', expect.any(String));
    const geloggt = protokollieren.mock.calls.flat().join(' ');
    expect(geloggt).not.toContain('Max Mustermann');
    expect(geloggt).not.toContain('max@example.invalid');
    expect(geloggt).toContain('name');
    expect(geloggt).toContain('email');
  });

  it('ruft get-identity gar nicht erst auf, wenn kein Access-JWT vorliegt', async () => {
    const antwort = await verarbeiteProfilbild(anfrage({ ohneToken: true }));

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toEqual({ profilbildUrl: null });
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'DELETE'])('lehnt %s ab', async (methode) => {
    const antwort = await verarbeiteProfilbild(anfrage({ method: methode }));

    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET');
    expect(abrufen).not.toHaveBeenCalled();
  });
});
