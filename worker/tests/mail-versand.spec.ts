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
  it('meldet Nichterreichbarkeit als VersandFehler mit Grund upstream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Invalid header value: "Bearer geheimes-token\\n"')),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const versand = await waehleVersand('resend', umgebung());
    const versuch = versand.sende(NACHRICHT);

    await expect(versuch).rejects.toBeInstanceOf(VersandFehler);
    await expect(versuch).rejects.toMatchObject({ grund: 'upstream' });
  });

  it('protokolliert Fehlerklasse und -text, aber nie das Token', async () => {
    const geheim = 'ss_geheimes-echtes-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(`Invalid header: ${geheim}`)));
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const versand = await waehleVersand('resend', umgebung({ MAIL_API_TOKEN: geheim }));
    await versand.sende(NACHRICHT).catch(() => {});

    expect(logSpy).toHaveBeenCalledWith(
      'MAIL_API_TRANSPORTFEHLER',
      expect.stringContaining('TypeError'),
    );
    for (const [, ...werte] of logSpy.mock.calls) {
      for (const wert of werte) expect(String(wert)).not.toContain(geheim);
    }
  });
});

describe('resend: abgelehnte Antwort', () => {
  it('meldet eine nicht erfolgreiche Antwort als VersandFehler, ohne den Antworttext zu lesen', async () => {
    const koerper = { body: { cancel: vi.fn() } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, ...koerper } as unknown as Response),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const versand = await waehleVersand('resend', umgebung());
    await expect(versand.sende(NACHRICHT)).rejects.toMatchObject({ grund: 'upstream' });
    expect(koerper.body.cancel).toHaveBeenCalledOnce();
  });
});
