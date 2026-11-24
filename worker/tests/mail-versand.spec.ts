import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MailVersandKonfiguration,
  VersandFehler,
  versandwegVerfuegbar,
  waehleVersand,
} from '../src/mail-versand';

const NACHRICHT = {
  an: 'leitung@example.test',
  betreff: 'Bericht',
  text: 'txt',
  html: '<p>txt</p>',
};

function umgebung(
  ueberschreibung: Partial<MailVersandKonfiguration> = {},
): MailVersandKonfiguration {
  return {
    MAIL_ABSENDER: 'berichte@example.test',
    MAIL_API_TOKEN: 'geheimes-token',
    ...ueberschreibung,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resend: Token wird getrimmt', () => {
  it('erkennt ein Token mit angehängtem Zeilenumbruch als eingerichtet', async () => {
    const verfuegbar = await versandwegVerfuegbar(
      'resend',
      umgebung({ MAIL_API_TOKEN: 'geheimes-token\n' }),
    );
    expect(verfuegbar).toBe(true);
  });

  it('meldet ein Token aus nur Leerraum als nicht eingerichtet', async () => {
    const verfuegbar = await versandwegVerfuegbar('resend', umgebung({ MAIL_API_TOKEN: '   ' }));
    expect(verfuegbar).toBe(false);
  });

  it('schickt das getrimmte Token als Authorization-Header, nicht das rohe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const versand = await waehleVersand(
      'resend',
      umgebung({ MAIL_API_TOKEN: '  geheimes-token \n' }),
    );
    await versand.sende(NACHRICHT);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer geheimes-token');
  });
});

describe('resend: Transportfehler vor einer Antwort', () => {
  it('meldet eine gescheiterte Verbindung als nicht-erreichbar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Invalid header value: "Bearer geheimes-token\\n"')),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const versand = await waehleVersand('resend', umgebung());
    const versuch = versand.sende(NACHRICHT);

    await expect(versuch).rejects.toBeInstanceOf(VersandFehler);
    await expect(versuch).rejects.toMatchObject({ grund: 'nicht-erreichbar' });
  });

  it('protokolliert Fehlerklasse und -text, aber nie das Token', async () => {
    const geheim = 'ss_geheimes-echtes-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(`Invalid header: ${geheim}`)));
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const versand = await waehleVersand('resend', umgebung({ MAIL_API_TOKEN: geheim }));
    await versand.sende(NACHRICHT).catch(() => {});

    expect(logSpy).toHaveBeenCalledWith(
      'MAIL_VERSAND_NICHT_ERREICHBAR',
      expect.stringContaining('TypeError'),
    );
    for (const [, ...werte] of logSpy.mock.calls) {
      for (const wert of werte) expect(String(wert)).not.toContain(geheim);
    }
  });
});

describe('resend: Weiterleitung', () => {
  it('setzt redirect: manual, nicht error, da workerd error nicht unterstützt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const versand = await waehleVersand('resend', umgebung());
    await versand.sende(NACHRICHT);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('manual');
  });
});

describe('resend: abgelehnte Antwort', () => {
  it('meldet 401 als Zugangsproblem, ohne den Antworttext zu lesen', async () => {
    const koerper = { body: { cancel: vi.fn() } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, ...koerper } as unknown as Response),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const versand = await waehleVersand('resend', umgebung());
    await expect(versand.sende(NACHRICHT)).rejects.toMatchObject({ grund: 'zugang-abgelehnt' });
    expect(koerper.body.cancel).toHaveBeenCalledOnce();
  });

  it('trennt eine abgelehnte Absenderdomain (403) von sonstiger Ablehnung (422)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const antwort = (status: number) =>
      ({ ok: false, status, body: { cancel: vi.fn() } }) as unknown as Response;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(403)));
    const mitDomainproblem = await waehleVersand('resend', umgebung());
    await expect(mitDomainproblem.sende(NACHRICHT)).rejects.toMatchObject({
      grund: 'zugang-abgelehnt',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(422)));
    const mitDatenproblem = await waehleVersand('resend', umgebung());
    await expect(mitDatenproblem.sende(NACHRICHT)).rejects.toMatchObject({ grund: 'abgelehnt' });
  });

  it('folgt einer Weiterleitung nicht und meldet sie als solche', async () => {
    // Sonst ginge das Token an ein fremdes Ziel; mit redirect: 'error' wäre die
    // Weiterleitung zudem ununterscheidbar von einer Nichterreichbarkeit.
    const koerper = { body: { cancel: vi.fn() } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 301, ...koerper } as unknown as Response),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const versand = await waehleVersand('resend', umgebung());
    await expect(versand.sende(NACHRICHT)).rejects.toMatchObject({ grund: 'umleitung' });

    const [, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect(init.redirect).toBe('manual');
  });
});

describe('resend: Zeitlimit', () => {
  it('meldet einen Abbruch durch das Zeitlimit als zeitlimit, nicht als Netzwerkfehler', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_ziel: string, init: RequestInit) =>
            new Promise<Response>((_, ablehnen) => {
              init.signal?.addEventListener('abort', () => ablehnen(new Error('aborted')));
            }),
        ),
      );

      const versand = await waehleVersand('resend', umgebung());
      const versuch = versand.sende(NACHRICHT);
      const erwartung = expect(versuch).rejects.toMatchObject({ grund: 'zeitlimit' });
      await vi.advanceTimersByTimeAsync(20_000);
      await erwartung;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resend: nicht headertaugliches Token', () => {
  // Ein solcher Wert lässt fetch() schon beim Bauen der Anfrage scheitern und
  // sah bisher wie eine Störung beim Anbieter aus.
  const KAPUTT = 'geheimes\ntoken';

  it('gilt als nicht eingerichtet, statt den Versand erst scheitern zu lassen', async () => {
    expect(await versandwegVerfuegbar('resend', umgebung({ MAIL_API_TOKEN: KAPUTT }))).toBe(false);
  });

  it('meldet das als Konfigurationsfehler, nicht als Anbieterproblem', async () => {
    const versuch = waehleVersand('resend', umgebung({ MAIL_API_TOKEN: KAPUTT }));
    await expect(versuch).rejects.toMatchObject({ grund: 'konfiguration-fehlt' });
    await expect(versuch).rejects.toThrow(/HTTP-Header/);
  });
});

describe('Anhänge und mehrere Empfänger', () => {
  it('schickt über den HTTP-Anbieter alle Empfänger und die Anhänge in einer Anfrage', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const versand = await waehleVersand('resend', umgebung());
    await versand.sende({
      ...NACHRICHT,
      weitereEmpfaenger: ['zweite@example.test'],
      anhaenge: [{ dateiname: 'a.pdf', inhaltBase64: 'QQ==' }],
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.to).toEqual(['leitung@example.test', 'zweite@example.test']);
    expect(body.attachments).toEqual([{ filename: 'a.pdf', content: 'QQ==' }]);
  });

  it('sendet ohne Anhänge kein leeres attachments-Feld', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await (await waehleVersand('resend', umgebung())).sende(NACHRICHT);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).not.toHaveProperty('attachments');
  });

  it('sendet über Email Routing an jeden Empfänger einzeln und lehnt Anhänge ab', async () => {
    const binding = { send: vi.fn(async () => undefined) };
    const versand = await waehleVersand(
      'email-routing',
      umgebung({ MAIL_ROUTING: binding as never }),
    );
    await versand.sende({ ...NACHRICHT, weitereEmpfaenger: ['zweite@example.test'] });
    expect(
      binding.send.mock.calls.map((aufruf) => (aufruf as unknown as [{ to: string }])[0].to),
    ).toEqual(['leitung@example.test', 'zweite@example.test']);
    await expect(
      versand.sende({ ...NACHRICHT, anhaenge: [{ dateiname: 'a.pdf', inhaltBase64: 'QQ==' }] }),
    ).rejects.toMatchObject({ grund: 'anhang-nicht-unterstuetzt' });
  });
});
