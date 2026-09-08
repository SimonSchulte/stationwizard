import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import worker, { type Env } from '../src';

const jwks = vi.hoisted(() => ({
  aufloesen: vi.fn(),
  erzeugen: vi.fn(),
}));

// Nur die Schlüsselbeschaffung wird ersetzt; jose prüft echte RSA-Signaturen und alle Claims.
vi.mock('jose', async (original) => {
  const jose = await original<typeof import('jose')>();
  return {
    ...jose,
    createRemoteJWKSet: (...argumente: unknown[]) => {
      jwks.erzeugen(...argumente);
      return (...anfrage: unknown[]) => jwks.aufloesen(...anfrage);
    },
  };
});

const TEAM_DOMAIN = 'https://stationwizard-test.cloudflareaccess.com';
const AUDIENCE = 'stationwizard-test-audience';
const ORIGIN = 'https://stationwizard.example';
const EMAIL = 'ausbildung@example.invalid';
let privaterSchluessel: CryptoKey;
let fremderSchluessel: CryptoKey;
let lokaleSchluessel: ReturnType<typeof createLocalJWKSet>;
let umgebung: Env;

function standardClaims(): JWTPayload {
  const jetzt = Math.floor(Date.now() / 1000);
  return {
    iss: TEAM_DOMAIN,
    aud: [AUDIENCE],
    sub: 'erfundener-testbenutzer',
    email: EMAIL,
    exp: jetzt + 300,
    nbf: jetzt - 5,
    iat: jetzt - 5,
    type: 'app',
  };
}

async function tokenFuer(
  claims: JWTPayload = standardClaims(),
  schluessel = privaterSchluessel,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-schluessel' })
    .sign(schluessel);
}

async function anfragen(
  pfad: string,
  token: string | null = null,
  optionen: RequestInit = {},
): Promise<Response> {
  const header = new Headers(optionen.headers);
  if (token !== null) {
    header.set('Cf-Access-Jwt-Assertion', token);
  }
  return worker.fetch(new Request(`${ORIGIN}${pfad}`, { ...optionen, headers: header }), umgebung);
}

beforeAll(async () => {
  const schluessel = await generateKeyPair('RS256');
  privaterSchluessel = schluessel.privateKey;
  fremderSchluessel = (await generateKeyPair('RS256')).privateKey;
  const oeffentlich = await exportJWK(schluessel.publicKey);
  lokaleSchluessel = createLocalJWKSet({
    keys: [{ ...oeffentlich, kid: 'test-schluessel', alg: 'RS256', use: 'sig' }],
  });
});

beforeEach(() => {
  jwks.aufloesen.mockImplementation(lokaleSchluessel);
  umgebung = {
    ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    ACCESS_AUD: AUDIENCE,
    ASSETS: {
      fetch: vi.fn(async () => new Response('<html>Test-SPA</html>')),
    } as unknown as Fetcher,
  };
});

describe('Access vor sämtlichen Assets und APIs', () => {
  it.each([
    '/',
    '/ausbildung',
    '/einsatz/planung/test',
    '/main.js',
    '/api/status',
    '/api/nextcloud/arbeitsmappe',
    '/api/nextcloud/planungen',
  ])('sperrt %s ohne Anwendungstoken', async (pfad) => {
    const antwort = await anfragen(pfad);
    expect(antwort.status).toBe(401);
    expect(await antwort.json()).toMatchObject({ code: 'ACCESS_TOKEN_FEHLT' });
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
    expect(jwks.aufloesen).not.toHaveBeenCalled();
  });

  it('verifiziert echte Signaturen und liefert nur die bestätigte E-Mail-Adresse', async () => {
    const antwort = await anfragen('/api/benutzer', await tokenFuer());
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ email: EMAIL });
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(jwks.erzeugen).toHaveBeenCalledWith(
      new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`),
      expect.objectContaining({ timeoutDuration: 5000 }),
    );
  });

  it('liefert Assets erst nach erfolgreicher JWT-Prüfung', async () => {
    const antwort = await anfragen('/ausbildung/jahresplan', await tokenFuer());
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toBe('<html>Test-SPA</html>');
    expect(umgebung.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url: `${ORIGIN}/ausbildung/jahresplan` }),
    );
  });

  it('weist eine gültige Signatur eines fremden Schlüssels zurück', async () => {
    const antwort = await anfragen('/', await tokenFuer(standardClaims(), fremderSchluessel));
    expect(antwort.status).toBe(401);
    expect(await antwort.json()).toMatchObject({ code: 'ACCESS_TOKEN_UNGUELTIG' });
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('weist abgelaufene Token zurück', async () => {
    const antwort = await anfragen(
      '/',
      await tokenFuer({ ...standardClaims(), exp: Math.floor(Date.now() / 1000) - 60 }),
    );
    expect(antwort.status).toBe(401);
    expect(await antwort.json()).toMatchObject({ code: 'ACCESS_TOKEN_ABGELAUFEN' });
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['aud', ['andere-anwendung']],
    ['iss', 'https://anderes-team.cloudflareaccess.com'],
    ['nbf', Math.floor(Date.now() / 1000) + 3600],
    ['email', null],
    ['email', '  '],
    ['sub', ''],
    ['type', 'org'],
  ])('weist ungültiges Claim %s=%s zurück', async (claim, wert) => {
    const antwort = await anfragen('/', await tokenFuer({ ...standardClaims(), [claim]: wert }));
    expect(antwort.status).toBe(401);
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it.each(['exp', 'iss', 'aud', 'sub', 'email'])('verlangt Claim %s', async (claim) => {
    const claims = standardClaims();
    delete claims[claim];
    const antwort = await anfragen('/', await tokenFuer(claims));
    expect(antwort.status).toBe(401);
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('akzeptiert ein Anwendungstoken ohne optionales type-Claim', async () => {
    const claims = standardClaims();
    delete claims['type'];
    expect((await anfragen('/api/benutzer', await tokenFuer(claims))).status).toBe(200);
  });

  it('weist symmetrische Signaturen zurück', async () => {
    const token = await new SignJWT(standardClaims())
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('nur-im-test-generierter-symmetrischer-schluessel'));
    const antwort = await anfragen('/', token);
    expect(antwort.status).toBe(401);
    expect(jwks.aufloesen).not.toHaveBeenCalled();
  });

  it('weist ein manipuliertes Token zurück, ohne seinen Inhalt auszugeben', async () => {
    const token = 'gefaelschtes-token-mit-geheimnis';
    const antwort = await anfragen('/', token);
    expect(antwort.status).toBe(401);
    expect(await antwort.text()).not.toContain(token);
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('weist einen nur gesetzten E-Mail-Header ohne signiertes JWT zurück', async () => {
    const antwort = await anfragen('/api/benutzer', null, {
      headers: { 'Cf-Access-Authenticated-User-Email': EMAIL },
    });
    expect(antwort.status).toBe(401);
    expect(await antwort.text()).not.toContain(EMAIL);
  });

  it('sperrt bei nicht erreichbaren öffentlichen Schlüsseln ohne Fehlerdetails zu verraten', async () => {
    jwks.aufloesen.mockRejectedValue(new Error('internes-geheimnis-in-netzwerkfehler'));
    const antwort = await anfragen('/', await tokenFuer());
    expect(antwort.status).toBe(503);
    expect(await antwort.json()).toEqual({
      code: 'ACCESS_PRUEFUNG_NICHT_ERREICHBAR',
      nachricht: 'Die Anmeldung kann derzeit nicht geprüft werden. Bitte erneut versuchen.',
    });
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });
});

describe('Laufzeitkonfiguration', () => {
  it.each([
    ['ACCESS_TEAM_DOMAIN', undefined],
    ['ACCESS_AUD', undefined],
    ['ACCESS_AUD', ''],
    ['ACCESS_AUD', ' audience-mit-leerzeichen '],
    ['ACCESS_TEAM_DOMAIN', 'http://stationwizard-test.cloudflareaccess.com'],
    ['ACCESS_TEAM_DOMAIN', 'https://stationwizard-test.cloudflareaccess.com/'],
    ['ACCESS_TEAM_DOMAIN', 'https://stationwizard-test.cloudflareaccess.com.evil.example'],
    ['ACCESS_TEAM_DOMAIN', 'https://evil.example@stationwizard-test.cloudflareaccess.com'],
    ['ACCESS_TEAM_DOMAIN', 'https://stationwizard-test.cloudflareaccess.com:8443'],
    ['ACCESS_TEAM_DOMAIN', 'https://stationwizard-test.cloudflareaccess.com?url=evil'],
  ])('sperrt bei %s=%s vor jeglichem Abruf', async (feld, wert) => {
    umgebung = { ...umgebung, [feld]: wert };
    const antwort = await anfragen('/', await tokenFuer());
    expect(antwort.status).toBe(503);
    expect(await antwort.json()).toMatchObject({ code: 'ACCESS_KONFIGURATION_FEHLT' });
    expect(jwks.aufloesen).not.toHaveBeenCalled();
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });
});

describe('API-Routing und schreibende Anfragen', () => {
  it('liefert den Verbindungszustand nach Anmeldung', async () => {
    const antwort = await anfragen('/api/status', await tokenFuer());
    expect(await antwort.json()).toEqual({ status: 'erreichbar' });
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each(['/api', '/api/unbekannt', '/api/efs/getveranstaltungen', '/api/nextcloud/datei'])(
    'liefert für %s JSON 404 statt der SPA',
    async (pfad) => {
      const antwort = await anfragen(pfad, await tokenFuer());
      expect(antwort.status).toBe(404);
      expect(await antwort.json()).toMatchObject({
        code: pfad.startsWith('/api/nextcloud/')
          ? 'NEXTCLOUD_PFAD_UNGUELTIG'
          : 'API_NICHT_GEFUNDEN',
      });
      expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'weist %s aus einer fremden Origin zurück',
    async (method) => {
      const antwort = await anfragen('/api/status', await tokenFuer(), {
        method,
        headers: { Origin: 'https://fremde-seite.example' },
      });
      expect(antwort.status).toBe(403);
      expect(await antwort.json()).toMatchObject({ code: 'ANFRAGE_URSPRUNG_UNGUELTIG' });
      expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
    },
  );

  it('weist opaque Origin und cross-site-Metadaten zurück', async () => {
    for (const headers of [{ Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      const antwort = await anfragen('/api/status', await tokenFuer(), {
        method: 'POST',
        headers,
      });
      expect(antwort.status).toBe(403);
    }
  });

  it('behandelt dieselbe Origin regulär und lehnt nicht angebotene Methoden ab', async () => {
    const antwort = await anfragen('/api/status', await tokenFuer(), {
      method: 'POST',
      headers: { Origin: ORIGIN },
    });
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET');
  });

  it('leitet schreibende Aufrufe nicht an Assets weiter', async () => {
    const antwort = await anfragen('/ausbildung', await tokenFuer(), { method: 'PUT' });
    expect(antwort.status).toBe(405);
    expect(umgebung.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
