import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_EFS_ANFRAGE_BYTES,
  MAX_EFS_ANTWORT_BYTES,
  verarbeiteEfs,
  type EfsKonfiguration,
} from '../src/efs';

const BASIS_URL = 'https://efs.example.invalid/ein/eigener/endpunkt/';
const TOKEN = 'ausschliesslich-erfundener-test-token+mit&sonderzeichen';
const abrufen = vi.fn<typeof fetch>();
let umgebung: EfsKonfiguration;

function anfrageFuer(
  aktion = 'getveranstaltungen',
  inhalt: unknown = {},
  optionen: RequestInit = {},
): Request {
  return new Request(`https://stationwizard.example/api/efs/${aktion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inhalt),
    ...optionen,
  });
}

function erfolg(inhalt: Record<string, unknown>): void {
  abrufen.mockResolvedValue(Response.json({ status: 'OK', ...inhalt }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', abrufen);
  abrufen.mockReset();
  umgebung = {
    HIORGSERVER_BASE_URL: BASIS_URL,
    HIORGSERVER_EFS_API_TOKEN: TOKEN,
  };
  erfolg({ einsaetze: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('EFS-Proxy: bekannte Aktionen und serverseitige Zugangsdaten', () => {
  it.each([
    ['checkapikey', {}, { orga: 'Fiktive Einheit', hiorg_org_id: '12' }],
    ['getveranstaltungen', {}, { einsaetze: [] }],
    ['getveranstaltung', { id: '123_A-b' }, { id: '123_A-b', titel: 'Fiktiver Dienst' }],
  ])('übersetzt %s in einen festen EFS-v2-Formularaufruf', async (aktion, inhalt, antwort) => {
    erfolg(antwort);
    const ergebnis = await verarbeiteEfs(anfrageFuer(aktion, inhalt), umgebung);
    expect(ergebnis.status).toBe(200);
    expect(abrufen).toHaveBeenCalledOnce();
    const [url, optionen] = abrufen.mock.calls[0];
    expect(url).toBe(BASIS_URL);
    expect(optionen).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      signal: expect.any(AbortSignal),
    });
    const gesendet = Object.fromEntries(new URLSearchParams(String(optionen?.body)));
    expect(gesendet).toEqual({
      apikey: TOKEN,
      version: '2',
      action: aktion,
      ...inhalt,
    });
    expect(ergebnis.headers.get('Cache-Control')).toBe('no-store');
    expect(ergebnis.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await ergebnis.text()).not.toContain(TOKEN);
  });

  it('löst beide Zugangsdaten aus Secrets-Store-Bindings auf', async () => {
    const basisLaden = vi.fn(async () => BASIS_URL);
    const tokenLaden = vi.fn(async () => TOKEN);
    const antwort = await verarbeiteEfs(anfrageFuer(), {
      HIORGSERVER_BASE_URL: { get: basisLaden },
      HIORGSERVER_EFS_API_TOKEN: { get: tokenLaden },
    });
    expect(antwort.status).toBe(200);
    expect(basisLaden).toHaveBeenCalledOnce();
    expect(tokenLaden).toHaveBeenCalledOnce();
  });

  it.each(['apikey', 'version', 'action', 'url', 'token', 'id', '__proto__'])(
    'verweigert das fremde Anfragefeld %s vor jedem Upstream-Abruf',
    async (feld) => {
      const antwort = await verarbeiteEfs(
        anfrageFuer('getveranstaltungen', { [feld]: 'fremd' }),
        umgebung,
      );
      expect(antwort.status).toBe(400);
      expect(abrufen).not.toHaveBeenCalled();
    },
  );

  it('verweigert auch zusätzliche Felder neben einer gültigen Detailkennung', async () => {
    const antwort = await verarbeiteEfs(
      anfrageFuer('getveranstaltung', {
        id: '123',
        apikey: 'schluessel-des-angreifers',
      }),
      umgebung,
    );
    expect(antwort.status).toBe(400);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'sendeinsatz',
    'getveranstaltung/',
    'GETVERANSTALTUNGEN',
    'getveranstaltungen/mehr',
  ])('bietet die unbekannte Aktion %s nicht an', async (aktion) => {
    const antwort = await verarbeiteEfs(anfrageFuer(aktion), umgebung);
    expect(antwort.status).toBe(404);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS'])('verweigert die Methode %s', async (method) => {
    const antwort = await verarbeiteEfs(
      anfrageFuer('getveranstaltungen', {}, { method, body: null }),
      umgebung,
    );
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('POST');
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each(['?apikey=fremd', '?'])('verweigert Queryteile %s in der URL', async (query) => {
    const antwort = await verarbeiteEfs(anfrageFuer(`getveranstaltungen${query}`), umgebung);
    expect(antwort.status).toBe(400);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 123, 'a/b', '../123', '123 456', 'a'.repeat(129)])(
    'verweigert ungültige Detailkennung %s',
    async (id) => {
      const antwort = await verarbeiteEfs(anfrageFuer('getveranstaltung', { id }), umgebung);
      expect(antwort.status).toBe(400);
      expect(abrufen).not.toHaveBeenCalled();
    },
  );
});

describe('EFS-Konfiguration und Größenlimits', () => {
  it.each([
    ['HIORGSERVER_BASE_URL', undefined],
    ['HIORGSERVER_EFS_API_TOKEN', undefined],
    ['HIORGSERVER_EFS_API_TOKEN', ''],
    ['HIORGSERVER_EFS_API_TOKEN', ` ${TOKEN}`],
    ['HIORGSERVER_BASE_URL', 'http://efs.example.invalid/api/efs/'],
    ['HIORGSERVER_BASE_URL', 'https://benutzer:passwort@efs.example.invalid/api/efs/'],
    ['HIORGSERVER_BASE_URL', 'https://efs.example.invalid/api/efs/?action=fremd'],
    ['HIORGSERVER_BASE_URL', 'https://efs.example.invalid/api/efs/#fragment'],
    ['HIORGSERVER_BASE_URL', 'https://efs.example.invalid/api/efs/?'],
    ['HIORGSERVER_BASE_URL', 'https://efs.example.invalid/api/efs/#'],
    ['HIORGSERVER_BASE_URL', 'https://@efs.example.invalid/api/efs/'],
    ['HIORGSERVER_BASE_URL', 'https://efs.example.invalid/api/\nefs/'],
    ['HIORGSERVER_BASE_URL', 'https:efs.example.invalid/api/efs/'],
    ['HIORGSERVER_BASE_URL', 'keine URL'],
  ])('verweigert ungültiges %s', async (feld, wert) => {
    umgebung = { ...umgebung, [feld]: wert };
    const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
    expect(antwort.status).toBe(503);
    expect(await antwort.json()).toMatchObject({
      code: 'EFS_KONFIGURATION_FEHLT',
    });
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('sperrt, wenn ein Secret nicht auflösbar ist', async () => {
    umgebung.HIORGSERVER_EFS_API_TOKEN = {
      get: vi.fn().mockRejectedValue(new Error(`Fehler ${TOKEN}`)),
    };
    const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
    expect(antwort.status).toBe(503);
    expect(await antwort.text()).not.toContain(TOKEN);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each([[], null, 'text', 12])('verlangt ein Anfrageobjekt statt %s', async (inhalt) => {
    const antwort = await verarbeiteEfs(anfrageFuer('getveranstaltungen', inhalt), umgebung);
    expect(antwort.status).toBe(400);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('verweigert ungültiges JSON und fremde Inhaltsformate', async () => {
    expect(
      (await verarbeiteEfs(anfrageFuer('getveranstaltungen', {}, { body: '{kaputt' }), umgebung))
        .status,
    ).toBe(400);
    expect(
      (
        await verarbeiteEfs(
          anfrageFuer('getveranstaltungen', {}, { headers: { 'Content-Type': 'text/plain' } }),
          umgebung,
        )
      ).status,
    ).toBe(415);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('begrenzt den tatsächlichen Anfragebody auch ohne Content-Length', async () => {
    const antwort = await verarbeiteEfs(
      anfrageFuer('getveranstaltungen', {}, { body: ' '.repeat(MAX_EFS_ANFRAGE_BYTES + 1) }),
      umgebung,
    );
    expect(antwort.status).toBe(413);
    expect(abrufen).not.toHaveBeenCalled();
  });

  it.each(['{', '{}'])('bricht einen offenen Upload nach 30 Sekunden ab: %s', async (anfang) => {
    vi.useFakeTimers();
    const abbrechen = vi.fn();
    const inhalt = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(anfang));
        // Auch ein bereits vollständiges JSON muss sein Übertragungsende erreichen.
      },
      cancel: abbrechen,
    });
    const anfrage = anfrageFuer('getveranstaltungen', {}, {
      body: inhalt,
      duplex: 'half',
    } as RequestInit);
    let abgeschlossen = false;
    const laufend = verarbeiteEfs(anfrage, umgebung).then((antwort) => {
      abgeschlossen = true;
      return antwort;
    });

    await vi.advanceTimersByTimeAsync(29_999);
    expect(abgeschlossen).toBe(false);
    expect(abbrechen).not.toHaveBeenCalled();
    expect(abrufen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const antwort = await laufend;
    expect(antwort.status).toBe(408);
    expect(await antwort.json()).toEqual({
      code: 'EFS_UPLOAD_ZEITLIMIT',
      nachricht: 'Die Anfrage wurde nicht rechtzeitig übertragen.',
    });
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('EFS_UPLOAD_ZEITLIMIT');
    expect(abbrechen).toHaveBeenCalledOnce();
    expect(inhalt.locked).toBe(false);
    expect(abrufen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('begrenzt angekündigte Antwortgrößen', async () => {
    abrufen.mockResolvedValue(
      new Response('{}', {
        headers: { 'Content-Length': String(MAX_EFS_ANTWORT_BYTES + 1) },
      }),
    );
    const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
    expect(antwort.status).toBe(502);
    expect(await antwort.json()).toMatchObject({
      code: 'EFS_ANTWORT_ZU_GROSS',
    });
  });

  it('begrenzt tatsächliche Antwortgrößen auch bei falschem Content-Length', async () => {
    abrufen.mockResolvedValue(
      new Response(' '.repeat(MAX_EFS_ANTWORT_BYTES + 1), {
        headers: { 'Content-Length': '1' },
      }),
    );
    const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
    expect(antwort.status).toBe(502);
    expect(await antwort.json()).toMatchObject({
      code: 'EFS_ANTWORT_ZU_GROSS',
    });
  });
});

describe('EFS-Antworten und unveränderte Fachdaten', () => {
  it('übernimmt die bekannte Veranstaltungskopfdaten und filtert Zusatzfelder', async () => {
    const einsatz = {
      id: 123,
      titel: 'Fiktiver Sanitätsdienst',
      stichwort: 'Übung',
      datum_von: '2026-09-08',
      datum_bis: '2026-09-09',
      beginn: 1788825600,
      end: 1788912000,
      zeitpunkt: '2026-09-08T08:00:00Z',
      ort: 'Erfundene Halle',
      veranstaltung_id: 'v-1',
    };
    erfolg({
      einsaetze: [{ ...einsatz, apikey: TOKEN, intern: { zugang: TOKEN } }],
      token: TOKEN,
    });
    const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
    expect(await antwort.json()).toEqual({
      status: 'OK',
      einsaetze: [einsatz],
    });
  });

  it('erhält sämtliche verwendeten Detailfelder und Qualifikationsstrings unverändert', async () => {
    const kraft = {
      hiorg_ek_id: 42,
      hiorg_org_id: '12',
      vorname: 'Erfundene',
      nachname: 'Testperson',
      fw_qual: 'Unveränderte FW-Ausbildung',
      med_qual: 'Rettungssanitäter/in',
      fuehr_qual: 'Zugführer:in',
      bes_ausbild: 'Unveränderte Sonderausbildung',
      tel_mobil: '+49 000 000000',
    };
    const mittel = {
      id: 8,
      bezeichnung: 'Test-RTW',
      funkruf: 'Test 1-83-1',
      fugcode: 'RTW',
    };
    erfolg({
      id: '123',
      titel: 'Erfundener Dienst',
      zeitraum_bemerk: 'Nur synthetische Testdaten',
      einsatzkraefte_imeinsatz: {
        '42': { ...kraft, apikey: TOKEN, privat: TOKEN },
      },
      einsatzmittel_imeinsatz: [{ ...mittel, apikey: TOKEN }],
      fehler: TOKEN,
    });
    const antwort = await verarbeiteEfs(anfrageFuer('getveranstaltung', { id: '123' }), umgebung);
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({
      status: 'OK',
      id: '123',
      titel: 'Erfundener Dienst',
      zeitraum_bemerk: 'Nur synthetische Testdaten',
      einsatzkraefte_imeinsatz: { '42': kraft },
      einsatzmittel_imeinsatz: [mittel],
    });
  });

  it('erhält den bestehenden Rückfall auf leere fehlende Detailsammlungen', async () => {
    erfolg({ id: '123', titel: 'Fiktiver Dienst' });
    const antwort = await verarbeiteEfs(anfrageFuer('getveranstaltung', { id: '123' }), umgebung);
    expect(await antwort.json()).toEqual({
      status: 'OK',
      id: '123',
      titel: 'Fiktiver Dienst',
      einsatzkraefte_imeinsatz: {},
      einsatzmittel_imeinsatz: [],
    });
  });

  it('akzeptiert wie der bisherige Client JSON auch ohne passenden Upstream-Inhaltstyp', async () => {
    abrufen.mockResolvedValue(new Response(JSON.stringify({ status: 'OK', einsaetze: [] })));
    expect((await verarbeiteEfs(anfrageFuer(), umgebung)).status).toBe(200);
  });

  it.each([
    ['checkapikey', { status: 'OK' }],
    ['checkapikey', { status: 'OK', orga: 'Fiktiv' }],
    ['checkapikey', { status: 'OK', orga: 'Fiktiv', hiorg_org_id: {} }],
    ['getveranstaltungen', { status: 'OK' }],
    ['getveranstaltungen', { status: 'OK', einsaetze: {} }],
    ['getveranstaltungen', { status: 'OK', einsaetze: [null] }],
    ['getveranstaltungen', { status: 'OK', einsaetze: [{ titel: 'Ohne ID' }] }],
    ['getveranstaltungen', { status: 'OK', einsaetze: [{ id: '1', titel: {} }] }],
    ['getveranstaltung', { status: 'OK' }],
    ['getveranstaltung', { status: 'OK', einsatzkraefte_imeinsatz: [] }],
    ['getveranstaltung', { status: 'OK', einsatzkraefte_imeinsatz: { '1': 3 } }],
    ['getveranstaltung', { status: 'OK', einsatzmittel_imeinsatz: {} }],
    ['getveranstaltung', { status: 'OK', einsatzmittel_imeinsatz: [{ fugcode: {} }] }],
  ])('behandelt unvollständige oder falsche %s-Antworten als Fehler', async (aktion, inhalt) => {
    abrufen.mockResolvedValue(Response.json(inhalt));
    const antwort = await verarbeiteEfs(
      anfrageFuer(aktion, aktion === 'getveranstaltung' ? { id: '123' } : {}),
      umgebung,
    );
    expect(antwort.status).toBe(502);
    expect(await antwort.json()).toMatchObject({
      code: 'EFS_ANTWORT_UNGUELTIG',
    });
  });

  it.each([
    { status: 'FEHLER', fehler: `Falscher Key ${TOKEN} bei ${BASIS_URL}` },
    { status: 'OK', einsaetze: [{ id: '1', titel: TOKEN }] },
    {
      status: 'OK',
      einsaetze: [{ id: '1', titel: encodeURIComponent(TOKEN) }],
    },
  ])('veröffentlicht keine reflektierten Zugangsdaten', async (inhalt) => {
    abrufen.mockResolvedValue(Response.json(inhalt));
    const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
    expect(antwort.status).toBe(502);
    const text = await antwort.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(encodeURIComponent(TOKEN));
    expect(text).not.toContain(BASIS_URL);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([301, 302, 303, 307, 308])(
    'meldet die Weiterleitung %s als eigenen Diagnosecode, ohne ihr zu folgen',
    async (status) => {
      abrufen.mockResolvedValue(
        new Response(`${BASIS_URL}: ${TOKEN}`, {
          status,
          headers: { Location: 'http://umleitungsziel.example.invalid:1080/' },
        }),
      );
      const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
      expect(abrufen).toHaveBeenCalledOnce();
      expect(antwort.status).toBe(502);
      expect(await antwort.json()).toEqual({
        code: 'EFS_UMLEITUNG',
        nachricht: 'HiOrg beantwortet die konfigurierte EFS-Adresse mit einer Weiterleitung.',
      });
      expect(antwort.headers.get('Location')).toBeNull();
    },
  );

  it.each([401, 403, 429, 500])(
    'übersetzt HTTP %s in einen sicheren 502-Fehler',
    async (status) => {
      abrufen.mockResolvedValue(
        new Response(`${BASIS_URL}: ${TOKEN}`, {
          status,
          headers: { Location: BASIS_URL },
        }),
      );
      const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
      expect(antwort.status).toBe(502);
      expect(await antwort.json()).toEqual({
        code: 'EFS_ABRUF_FEHLGESCHLAGEN',
        nachricht: 'HiOrg hat den Abruf abgelehnt.',
      });
      expect(antwort.headers.get('Location')).toBeNull();
    },
  );

  it('filtert Netzwerkfehler und redigiert Ziel und Token im Betreiberlog', async () => {
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    abrufen.mockRejectedValue(new Error(`Verbindung zu ${BASIS_URL} mit ${TOKEN} fehlgeschlagen`));
    const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
    expect(antwort.status).toBe(502);
    expect(await antwort.json()).toEqual({
      code: 'EFS_NICHT_ERREICHBAR',
      nachricht: 'HiOrg ist derzeit nicht erreichbar.',
    });
    const protokolliert = protokoll.mock.calls.map((teile) => teile.join(' ')).join('\n');
    expect(protokolliert).toContain('EFS_NICHT_ERREICHBAR');
    expect(protokolliert).not.toContain(TOKEN);
    expect(protokolliert).not.toContain(BASIS_URL);
    expect(protokolliert).not.toContain('efs.example.invalid');
    protokoll.mockRestore();
  });

  it('meldet ein überschrittenes Zeitlimit getrennt von Netzwerkfehlern', async () => {
    abrufen.mockImplementation(
      (_ziel, optionen) =>
        new Promise((_erfuellen, ablehnen) => {
          const signal = optionen?.signal;
          signal?.addEventListener('abort', () => ablehnen(signal.reason as Error), { once: true });
        }),
    );
    vi.useFakeTimers();
    const laufend = verarbeiteEfs(anfrageFuer(), umgebung);
    await vi.advanceTimersByTimeAsync(15000);
    const antwort = await laufend;
    expect(antwort.status).toBe(504);
    expect(await antwort.json()).toEqual({
      code: 'EFS_ZEITLIMIT',
      nachricht: 'HiOrg antwortet nicht rechtzeitig.',
    });
  });

  it.each(['<html>kein JSON</html>', 'null', '[]', '{}', ''])(
    'verweigert ungültige JSON-Antwort %s',
    async (text) => {
      abrufen.mockResolvedValue(new Response(text));
      const antwort = await verarbeiteEfs(anfrageFuer(), umgebung);
      expect(antwort.status).toBe(502);
      expect(await antwort.json()).toMatchObject({
        code: 'EFS_ANTWORT_UNGUELTIG',
      });
    },
  );
});
