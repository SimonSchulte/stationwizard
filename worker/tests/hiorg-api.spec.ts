import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HIORG_AUTORISIERUNG_URL,
  HIORG_PERSONAL_URL,
  HIORG_TOKEN_URL,
  verarbeiteHiorgApi,
  verarbeiteHiorgRueckruf,
  verarbeiteHiorgVerbinden,
  type HiorgApiKonfiguration,
} from '../src/hiorg-api';

const ORIGIN = 'https://stationwizard.example';
const CLIENT_ID = 'erfundene-client-id';
const CLIENT_SECRET = 'erfundenes-client-secret-0123456789';
const BENUTZER = { email: 'person@example.invalid' };
const STATE = 'A'.repeat(43);
const COOKIE = `__Host-stationwizard-hiorg-state=${STATE}`;

/** Nur die vier Anweisungen aus hiorg-api.ts, gegen eine In-Memory-Tabelle. */
class FakeHiorgDb {
  zeilen = new Map<string, { token_daten: string; aktualisiert_am: string }>();

  prepare(query: string) {
    const sql = query.trim().replace(/\s+/g, ' ');
    let werte: unknown[] = [];
    const anweisung = {
      bind: (...w: unknown[]) => {
        werte = w;
        return anweisung;
      },
      first: async () => {
        const zeile = this.zeilen.get(werte[0] as string);
        return zeile ? { token_daten: zeile.token_daten } : null;
      },
      run: async () => {
        if (sql.startsWith('INSERT INTO hiorg_verbindungen')) {
          const [email, token_daten, , aktualisiert_am] = werte as string[];
          this.zeilen.set(email, { token_daten, aktualisiert_am });
        } else if (sql.startsWith('UPDATE hiorg_verbindungen')) {
          const [token_daten, aktualisiert_am, email, alt] = werte as string[];
          if (this.zeilen.get(email)?.token_daten === alt) {
            this.zeilen.set(email, { token_daten, aktualisiert_am });
          }
        } else if (sql.startsWith('DELETE FROM hiorg_verbindungen')) {
          this.zeilen.delete(werte[0] as string);
        } else {
          throw new Error(`Unerwartete Anweisung: ${sql}`);
        }
        return { success: true, meta: { changes: 1 }, results: [] };
      },
    };
    return anweisung;
  }
}

const abrufen = vi.fn<typeof fetch>();
let db: FakeHiorgDb;
let umgebung: HiorgApiKonfiguration;

function tokenAntwort(inhalt: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: 'zugang-1',
    refresh_token: 'erneuerung-1',
    token_type: 'Bearer',
    expires_in: 3600,
    ...inhalt,
  });
}

function person(attribute: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'user',
    id: '9aabc46f91700bf0d97f625b7c5eeacf',
    attributes: {
      vorname: 'Erika',
      nachname: 'Beispiel',
      gruppen_namen: ['Bereitschaft'],
      qualifikationen: [
        { liste: 'med. Qualifikation', name: 'Rettungssanitäter/in', name_kurz: 'RS', rang: 4 },
      ],
      handy: '+49000000000',
      iban: 'DE00000000000000000000',
      adresse: 'Erfundene Straße 1',
      gebdat: '2000-01-01',
      allerg_intol: ['soja'],
      benutzerdefinierte_felder: [{ id: 'user1', name: 'Feld', wert: 'geheim' }],
      ...attribute,
    },
  };
}

async function verbinden(): Promise<void> {
  abrufen.mockResolvedValueOnce(tokenAntwort());
  const antwort = await verarbeiteHiorgRueckruf(
    new Request(`${ORIGIN}/hiorg/rueckruf?code=abc123&state=${STATE}`, {
      headers: { Cookie: COOKIE },
    }),
    umgebung,
    BENUTZER,
  );
  expect(antwort.headers.get('Location')).toBe('/#/einsatz?hiorg=verbunden');
  abrufen.mockReset();
}

function personalAnfrage(): Request {
  return new Request(`${ORIGIN}/api/hiorg/personal`);
}

beforeEach(() => {
  vi.stubGlobal('fetch', abrufen);
  abrufen.mockReset();
  db = new FakeHiorgDb();
  umgebung = {
    HIORG_SERVER_CLIENTID: CLIENT_ID,
    HIORG_SERVER_CLIENTSECRET: CLIENT_SECRET,
    BENUTZER_DB: db as unknown as D1Database,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('HiOrg-API: Verbinden', () => {
  it('leitet mit festen Parametern und einmaligem state zur HiOrg-Anmeldung', async () => {
    const antwort = await verarbeiteHiorgVerbinden(
      new Request(`${ORIGIN}/hiorg/verbinden`),
      umgebung,
    );
    expect(antwort.status).toBe(302);
    const ziel = new URL(antwort.headers.get('Location') ?? '');
    expect(`${ziel.origin}${ziel.pathname}`).toBe(HIORG_AUTORISIERUNG_URL);
    const state = ziel.searchParams.get('state') ?? '';
    expect(Object.fromEntries(ziel.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: `${ORIGIN}/hiorg/rueckruf`,
      scope: 'openid personal:read',
      state,
    });
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = antwort.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain(`__Host-stationwizard-hiorg-state=${state}.einsatz`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    // Das Client-Secret verlässt den Worker nie Richtung Browser.
    expect(antwort.headers.get('Location')).not.toContain(CLIENT_SECRET);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('meldet fehlende Einrichtung als Rückkehr statt HiOrg aufzurufen', async () => {
    umgebung.HIORG_SERVER_CLIENTSECRET = undefined;
    const antwort = await verarbeiteHiorgVerbinden(
      new Request(`${ORIGIN}/hiorg/verbinden`),
      umgebung,
    );
    expect(antwort.status).toBe(303);
    expect(antwort.headers.get('Location')).toBe('/#/einsatz?hiorg=nicht-eingerichtet');
  });
});

describe('HiOrg-API: Rückkehrziel', () => {
  it('führt nach der Anmeldung in das Modul zurück, aus dem sie gestartet wurde', async () => {
    const start = await verarbeiteHiorgVerbinden(
      new Request(`${ORIGIN}/hiorg/verbinden?ziel=personal`),
      umgebung,
    );
    const cookie = (start.headers.get('Set-Cookie') ?? '').split(';')[0];
    const state = new URL(start.headers.get('Location') ?? '').searchParams.get('state');
    expect(cookie.endsWith('.personal')).toBe(true);
    abrufen.mockResolvedValueOnce(tokenAntwort());
    const antwort = await verarbeiteHiorgRueckruf(
      new Request(`${ORIGIN}/hiorg/rueckruf?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
      }),
      umgebung,
      BENUTZER,
    );
    expect(antwort.headers.get('Location')).toBe('/#/personal?hiorg=verbunden');
  });

  it('ersetzt ein unbekanntes Ziel durch die Einsatzplanung statt frei weiterzuleiten', async () => {
    umgebung.HIORG_SERVER_CLIENTID = undefined;
    const antwort = await verarbeiteHiorgVerbinden(
      new Request(`${ORIGIN}/hiorg/verbinden?ziel=//fremd.example`),
      umgebung,
    );
    expect(antwort.headers.get('Location')).toBe('/#/einsatz?hiorg=nicht-eingerichtet');
  });
});

describe('HiOrg-API: Rückruf', () => {
  it('tauscht den Code und speichert das Token nur verschlüsselt', async () => {
    abrufen.mockResolvedValueOnce(tokenAntwort());
    const antwort = await verarbeiteHiorgRueckruf(
      new Request(`${ORIGIN}/hiorg/rueckruf?code=abc123&state=${STATE}`, {
        headers: { Cookie: `anderes=1; ${COOKIE}` },
      }),
      umgebung,
      BENUTZER,
    );
    expect(antwort.status).toBe(303);
    expect(antwort.headers.get('Location')).toBe('/#/einsatz?hiorg=verbunden');
    expect(antwort.headers.get('Set-Cookie')).toContain('Max-Age=0');

    const [url, optionen] = abrufen.mock.calls[0];
    expect(url).toBe(HIORG_TOKEN_URL);
    expect(optionen).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(Object.fromEntries(new URLSearchParams(String(optionen?.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'abc123',
      redirect_uri: `${ORIGIN}/hiorg/rueckruf`,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const gespeichert = db.zeilen.get(BENUTZER.email)?.token_daten ?? '';
    expect(gespeichert).toMatch(/^v1\./);
    expect(gespeichert).not.toContain('zugang-1');
    expect(gespeichert).not.toContain('erneuerung-1');
  });

  it.each([
    ['ohne Cookie', `code=abc&state=${STATE}`, undefined],
    ['mit abweichendem state', `code=abc&state=${'B'.repeat(43)}`, COOKIE],
    ['ohne state', 'code=abc', COOKIE],
  ])('verwirft einen Rückruf %s ohne Tokenabruf', async (_fall, query, cookie) => {
    const antwort = await verarbeiteHiorgRueckruf(
      new Request(`${ORIGIN}/hiorg/rueckruf?${query}`, {
        headers: cookie ? { Cookie: cookie } : {},
      }),
      umgebung,
      BENUTZER,
    );
    expect(antwort.headers.get('Location')).toBe('/#/einsatz?hiorg=ungueltig');
    expect(abrufen).not.toHaveBeenCalled();
    expect(db.zeilen.size).toBe(0);
  });

  it('meldet eine bei HiOrg abgebrochene Anmeldung', async () => {
    const antwort = await verarbeiteHiorgRueckruf(
      new Request(`${ORIGIN}/hiorg/rueckruf?error=access_denied&state=${STATE}`, {
        headers: { Cookie: COOKIE },
      }),
      umgebung,
      BENUTZER,
    );
    expect(antwort.headers.get('Location')).toBe('/#/einsatz?hiorg=abgebrochen');
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('speichert nichts, wenn HiOrg den Code ablehnt', async () => {
    abrufen.mockResolvedValueOnce(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const antwort = await verarbeiteHiorgRueckruf(
      new Request(`${ORIGIN}/hiorg/rueckruf?code=abc&state=${STATE}`, {
        headers: { Cookie: COOKIE },
      }),
      umgebung,
      BENUTZER,
    );
    expect(antwort.headers.get('Location')).toBe('/#/einsatz?hiorg=fehlgeschlagen');
    expect(db.zeilen.size).toBe(0);
  });
});

describe('HiOrg-API: Verbindungsstatus', () => {
  it('meldet eingerichtet/verbunden ohne HiOrg-Aufruf und trennt auf Wunsch', async () => {
    const status = () =>
      verarbeiteHiorgApi(new Request(`${ORIGIN}/api/hiorg/verbindung`), umgebung, BENUTZER);
    expect(await (await status()).json()).toEqual({ eingerichtet: true, verbunden: false });
    await verbinden();
    expect(await (await status()).json()).toEqual({ eingerichtet: true, verbunden: true });
    const trennen = await verarbeiteHiorgApi(
      new Request(`${ORIGIN}/api/hiorg/verbindung`, { method: 'DELETE' }),
      umgebung,
      BENUTZER,
    );
    expect(await trennen.json()).toEqual({ eingerichtet: true, verbunden: false });
    expect(db.zeilen.size).toBe(0);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('meldet fehlende Konfiguration ohne Fehlerstatus', async () => {
    umgebung.HIORG_SERVER_CLIENTID = undefined;
    const antwort = await verarbeiteHiorgApi(
      new Request(`${ORIGIN}/api/hiorg/verbindung`),
      umgebung,
      BENUTZER,
    );
    expect(await antwort.json()).toEqual({ eingerichtet: false, verbunden: false });
  });
});

describe('HiOrg-API: Personal', () => {
  it('verlangt eine Verbindung', async () => {
    const antwort = await verarbeiteHiorgApi(personalAnfrage(), umgebung, BENUTZER);
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('HIORG_NICHT_VERBUNDEN');
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('gibt nur die feste Feldauswahl weiter', async () => {
    await verbinden();
    abrufen.mockResolvedValueOnce(Response.json({ data: [person()] }));
    const antwort = await verarbeiteHiorgApi(personalAnfrage(), umgebung, BENUTZER);
    expect(antwort.status).toBe(200);
    const [url, optionen] = abrufen.mock.calls[0];
    expect(url).toBe(HIORG_PERSONAL_URL);
    expect(optionen?.headers).toMatchObject({ Authorization: 'Bearer zugang-1' });
    const text = await antwort.text();
    expect(JSON.parse(text)).toEqual({
      personen: [
        {
          id: '9aabc46f91700bf0d97f625b7c5eeacf',
          vorname: 'Erika',
          nachname: 'Beispiel',
          gruppen: ['Bereitschaft'],
          qualifikationen: [
            { liste: 'med. Qualifikation', name: 'Rettungssanitäter/in', kurz: 'RS' },
          ],
          telefon: '+49000000000',
        },
      ],
    });
    for (const verboten of ['DE000', 'Erfundene Straße', '2000-01-01', 'soja', 'geheim']) {
      expect(text).not.toContain(verboten);
    }
  });

  it('verwirft eine unerwartet geformte Antwort vollständig', async () => {
    await verbinden();
    abrufen.mockResolvedValueOnce(Response.json({ data: [person({ vorname: 42 })] }));
    const antwort = await verarbeiteHiorgApi(personalAnfrage(), umgebung, BENUTZER);
    expect(antwort.status).toBe(502);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('HIORG_API_ANTWORT_UNGUELTIG');
  });

  it('erneuert ein abgelaufenes Token vor dem Abruf und speichert das neue', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    await verbinden();
    const vorher = db.zeilen.get(BENUTZER.email)?.token_daten;
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    abrufen
      .mockResolvedValueOnce(
        tokenAntwort({ access_token: 'zugang-2', refresh_token: 'erneuerung-2' }),
      )
      .mockResolvedValueOnce(Response.json({ data: [] }));
    const antwort = await verarbeiteHiorgApi(personalAnfrage(), umgebung, BENUTZER);
    expect(antwort.status).toBe(200);
    expect(
      Object.fromEntries(new URLSearchParams(String(abrufen.mock.calls[0][1]?.body))),
    ).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'erneuerung-1' });
    expect(abrufen.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer zugang-2' });
    expect(db.zeilen.get(BENUTZER.email)?.token_daten).not.toBe(vorher);
  });

  it('verwirft die Verbindung, wenn HiOrg das Token endgültig ablehnt', async () => {
    await verbinden();
    abrufen
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const antwort = await verarbeiteHiorgApi(personalAnfrage(), umgebung, BENUTZER);
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('HIORG_VERBINDUNG_ABGELAUFEN');
    expect(db.zeilen.size).toBe(0);
  });

  it('meldet fehlende HiOrg-Rechte getrennt von einer abgelaufenen Anmeldung', async () => {
    await verbinden();
    abrufen.mockResolvedValueOnce(new Response('{"errors":[]}', { status: 403 }));
    const antwort = await verarbeiteHiorgApi(personalAnfrage(), umgebung, BENUTZER);
    expect(antwort.status).toBe(403);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('HIORG_API_BERECHTIGUNG_FEHLT');
    expect(db.zeilen.size).toBe(1);
  });

  it('macht einen unter anderer Identität abgelegten Datensatz unbrauchbar', async () => {
    await verbinden();
    const fremd = { email: 'andere@example.invalid' };
    db.zeilen.set(fremd.email, db.zeilen.get(BENUTZER.email)!);
    const antwort = await verarbeiteHiorgApi(personalAnfrage(), umgebung, fremd);
    expect(antwort.status).toBe(409);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('lehnt URL-Parameter ab', async () => {
    const antwort = await verarbeiteHiorgApi(
      new Request(`${ORIGIN}/api/hiorg/personal?filter[status]=gesperrt`),
      umgebung,
      BENUTZER,
    );
    expect(antwort.status).toBe(400);
  });
});
