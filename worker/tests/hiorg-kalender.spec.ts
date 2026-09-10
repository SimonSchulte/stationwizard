import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_HIORG_KALENDER_ANTWORT_BYTES,
  verarbeiteHiorgKalender,
  type HiorgKalenderKonfiguration,
} from '../src/hiorg-kalender';

// Frei erfundene Feed-URL und frei erfundene Termininhalte: aus dem echten Feed
// wird nur die Feldstruktur nachgebildet, keine realen Personen- oder Plandaten.
const GEHEIMER_PARAMETER = 'nur-fuer-den-test-erfunden-4711';
const FEED_URL = `https://www.hiorg-server.de/termine.json?ov=testov&key=${GEHEIMER_PARAMETER}`;

const abrufen = vi.fn<typeof fetch>();
let umgebung: HiorgKalenderKonfiguration;

function anfrage(pfad = '/api/hiorg/kalender', optionen: RequestInit = {}): Request {
  return new Request(`https://stationwizard.example${pfad}`, { method: 'GET', ...optionen });
}

interface RohEintrag {
  [feld: string]: unknown;
}

function rohEintrag(zusatz: RohEintrag = {}): RohEintrag {
  return {
    sortdate: 1789282800,
    enddate: 1789318800,
    verbez: 'Erfundene Ausbildung Verpflegung',
    typ: 'termin',
    id: 1000001,
    url: 'https://www.hiorg-server.de/formulare.php?ovx=test&amp;rt=t&amp;ri=1000001',
    verort: 'Erfundene Wache',
    treff: 'Erfundene Wache ab 18:00',
    ansprech: 'Erfundene Person',
    bemerkung: 'Erfundener Freitext',
    kursnr: '11',
    max_meldungen: 4,
    ...zusatz,
  };
}

function feed(...eintraege: RohEintrag[]): void {
  abrufen.mockResolvedValue(
    Response.json({ Server: 'HiOrg-Server', success: true, status: '200', data: eintraege }),
  );
}

async function inhaltVon(antwort: Response): Promise<Record<string, unknown>> {
  return (await antwort.clone().json()) as Record<string, unknown>;
}

async function eintraegeVon(antwort: Response): Promise<Record<string, unknown>[]> {
  const inhalt = await inhaltVon(antwort);
  return inhalt['eintraege'] as Record<string, unknown>[];
}

beforeEach(() => {
  vi.stubGlobal('fetch', abrufen);
  abrufen.mockReset();
  umgebung = { HIORGSERVER_CALENDER_FEED: FEED_URL };
  feed(rohEintrag());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('HiOrg-Kalender: Anfrageoberfläche', () => {
  it('liefert die Einträge des Feeds', async () => {
    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    expect(await inhaltVon(antwort)).toMatchObject({ status: 'OK' });
    expect(await eintraegeVon(antwort)).toHaveLength(1);
  });

  it('ruft den Feed lesend, ohne Weiterleitung und mit JSON-Erwartung ab', async () => {
    await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(abrufen).toHaveBeenCalledTimes(1);
    expect(abrufen.mock.calls[0]?.[0]).toBe(FEED_URL);
    expect(abrufen.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
  });

  it.each(['POST', 'PUT', 'DELETE'])('lehnt %s ab', async (methode) => {
    const antwort = await verarbeiteHiorgKalender(
      anfrage('/api/hiorg/kalender', { method: methode }),
      {
        ...umgebung,
      },
    );

    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET');
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('lehnt URL-Parameter ab', async () => {
    const antwort = await verarbeiteHiorgKalender(
      anfrage('/api/hiorg/kalender?jahr=2026'),
      umgebung,
    );

    expect(antwort.status).toBe(400);
    expect(await inhaltVon(antwort)).toMatchObject({ code: 'HIORG_KALENDER_ANFRAGE_UNGUELTIG' });
    expect(abrufen).not.toHaveBeenCalled();
  });

  it('kennt keinen weiteren Pfad unter /api/hiorg/', async () => {
    const antwort = await verarbeiteHiorgKalender(anfrage('/api/hiorg/anlegen'), umgebung);

    expect(antwort.status).toBe(404);
    expect(await inhaltVon(antwort)).toMatchObject({ code: 'API_NICHT_GEFUNDEN' });
    expect(abrufen).not.toHaveBeenCalled();
  });
});

describe('HiOrg-Kalender: Zugangsdatum', () => {
  it('löst das Secret auch aus einem Secrets-Store-Objekt auf', async () => {
    const antwort = await verarbeiteHiorgKalender(anfrage(), {
      HIORGSERVER_CALENDER_FEED: { get: vi.fn().mockResolvedValue(FEED_URL) } as never,
    });

    expect(antwort.status).toBe(200);
    expect(abrufen.mock.calls[0]?.[0]).toBe(FEED_URL);
  });

  it.each([
    ['fehlend', undefined],
    ['leer', ''],
    ['ohne TLS', 'http://www.hiorg-server.de/termine.json?key=x'],
    ['mit Userinfo', 'https://nutzer:geheim@www.hiorg-server.de/termine.json'],
    ['mit Fragment', 'https://www.hiorg-server.de/termine.json?key=x#teil'],
    ['fremder Host', 'https://beispiel.invalid/termine.json?key=x'],
    ['Host nur als Suffixtrick', 'https://hiorg-server.de.beispiel.invalid/termine.json'],
    ['kein URL', 'einfach-nur-text'],
  ])('sperrt bei %s Secret', async (_fall, wert) => {
    const antwort = await verarbeiteHiorgKalender(anfrage(), {
      HIORGSERVER_CALENDER_FEED: wert,
    });

    expect(antwort.status).toBe(503);
    expect(await inhaltVon(antwort)).toMatchObject({
      code: 'HIORG_KALENDER_KONFIGURATION_FEHLT',
    });
    expect(abrufen).not.toHaveBeenCalled();
  });
});

describe('HiOrg-Kalender: Upstream-Fehler', () => {
  it('folgt keiner Weiterleitung', async () => {
    abrufen.mockResolvedValue(new Response(null, { status: 302 }));

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(antwort.status).toBe(502);
    expect(await inhaltVon(antwort)).toMatchObject({ code: 'HIORG_KALENDER_UMLEITUNG' });
  });

  it('meldet einen abgelehnten Abruf mit festem Code', async () => {
    abrufen.mockResolvedValue(new Response('interner Fehlertext', { status: 500 }));

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(antwort.status).toBe(502);
    expect(await inhaltVon(antwort)).toMatchObject({
      code: 'HIORG_KALENDER_ABRUF_FEHLGESCHLAGEN',
    });
  });

  it('veröffentlicht bei einem Transportfehler weder Feed-URL noch Parameterwert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    abrufen.mockRejectedValue(new Error(`Verbindung zu ${FEED_URL} fehlgeschlagen`));

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);
    const rohtext = await antwort.clone().text();

    expect(antwort.status).toBe(502);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('HIORG_KALENDER_NICHT_ERREICHBAR');
    expect(rohtext).not.toContain(GEHEIMER_PARAMETER);
    expect(rohtext).not.toContain(FEED_URL);
    expect([...antwort.headers.values()].join(' ')).not.toContain(GEHEIMER_PARAMETER);
  });

  it('redigiert die Feed-URL auch im Betreiberlog', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    abrufen.mockRejectedValue(new Error(`Verbindung zu ${FEED_URL} fehlgeschlagen`));

    await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(log.mock.calls[0]?.join(' ')).not.toContain(GEHEIMER_PARAMETER);
  });

  it('begrenzt die Antwortgröße', async () => {
    abrufen.mockResolvedValue(
      new Response('x'.repeat(MAX_HIORG_KALENDER_ANTWORT_BYTES + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(antwort.status).toBe(502);
    expect(await inhaltVon(antwort)).toMatchObject({ code: 'HIORG_KALENDER_ANTWORT_ZU_GROSS' });
  });

  it.each([
    ['success: false', { success: false, data: [] }, 'success ist boolean statt true'],
    ['ohne data', { success: true }, 'data ist kein Array'],
    ['data kein Array', { success: true, data: {} }, 'data ist kein Array'],
    ['kein Objekt', [], 'Antwort ist kein JSON-Objekt'],
  ])(
    'verwirft eine unbrauchbare Hülle (%s) und protokolliert den Grund',
    async (_fall, inhalt, erwarteterGrund) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      abrufen.mockResolvedValue(Response.json(inhalt));

      const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

      expect(antwort.status).toBe(502);
      expect(await inhaltVon(antwort)).toMatchObject({ code: 'HIORG_KALENDER_ANTWORT_UNGUELTIG' });
      expect(log).toHaveBeenCalledWith('HIORG_KALENDER_ANTWORT_UNGUELTIG', erwarteterGrund);
    },
  );

  it('verwirft die Antwort, wenn kein einziger Eintrag brauchbar ist, und protokolliert die Anzahl', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    feed({ verbez: 'ohne Datum' }, { sortdate: 1789282800 });

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(antwort.status).toBe(502);
    expect(await inhaltVon(antwort)).toMatchObject({ code: 'HIORG_KALENDER_ANTWORT_UNGUELTIG' });
    expect(log).toHaveBeenCalledWith(
      'HIORG_KALENDER_ANTWORT_UNGUELTIG',
      'kein Eintrag der 2 Datensätze war brauchbar',
    );
  });

  it('entfernt einen Eintrag, dessen verbez ein konfiguriertes Zugangsdatum spiegelt, behält den Rest', async () => {
    feed(
      rohEintrag({ id: 1000001, verbez: `Ausbildung ${GEHEIMER_PARAMETER}` }),
      rohEintrag({ id: 1000002, verbez: 'Zweite erfundene Ausbildung' }),
    );

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    const eintraege = await eintraegeVon(antwort);
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toMatchObject({ id: 1000002 });
    expect(await antwort.clone().text()).not.toContain(GEHEIMER_PARAMETER);
  });

  it('entfernt nur den url-Link, wenn er ein konfiguriertes Zugangsdatum spiegelt, behält den Eintrag', async () => {
    feed(
      rohEintrag({ id: 1000001 }),
      rohEintrag({
        id: 1000002,
        url: `https://www.hiorg-server.de/formulare.php?ri=${GEHEIMER_PARAMETER}`,
      }),
    );

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

    expect(antwort.status).toBe(200);
    const eintraege = await eintraegeVon(antwort);
    expect(eintraege).toHaveLength(2);
    expect(eintraege.find((e) => e['id'] === 1000002)).not.toHaveProperty('url');
    expect(await antwort.clone().text()).not.toContain(GEHEIMER_PARAMETER);
  });

  it.each(['id', 'url', 'typ', 'status', 'termin', 'OK'])(
    'liefert die Einträge, auch wenn ein Query-Wert zufällig "%s" aus der eigenen JSON-Hülle trifft',
    async (zufaelligerJsonBaustein) => {
      const antwort = await verarbeiteHiorgKalender(anfrage(), {
        HIORGSERVER_CALENDER_FEED: `https://www.hiorg-server.de/termine.json?lab=${zufaelligerJsonBaustein}`,
      });

      expect(antwort.status).toBe(200);
      expect(await eintraegeVon(antwort)).toHaveLength(1);
    },
  );
});

describe('HiOrg-Kalender: Feldfilter', () => {
  it('reicht nur die benötigten Felder weiter', async () => {
    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);
    const [eintrag] = await eintraegeVon(antwort);

    expect(Object.keys(eintrag ?? {}).sort()).toEqual([
      'enddate',
      'id',
      'sortdate',
      'typ',
      'url',
      'verbez',
    ]);
  });

  it.each(['ansprech', 'bemerkung', 'verort', 'treff', 'kursnr', 'max_meldungen'])(
    'reicht %s bewusst nicht weiter',
    async (feld) => {
      const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);

      expect(await antwort.text()).not.toContain(feld);
    },
  );

  it('reicht die Dispositionsfelder eines Dienstes nicht weiter', async () => {
    feed(
      rohEintrag({
        typ: 'dienst',
        personal_ist: 0,
        personal_soll: 5,
        personal_vollbesetzt: false,
      }),
    );

    const antwort = await verarbeiteHiorgKalender(anfrage(), umgebung);
    const [eintrag] = await eintraegeVon(antwort);

    expect(eintrag).toMatchObject({ typ: 'dienst' });
    expect(Object.keys(eintrag ?? {})).not.toContain('personal_soll');
  });

  it('lässt ein leeres enddate weg statt es zu erfinden', async () => {
    feed(rohEintrag({ enddate: '' }));

    const [eintrag] = await eintraegeVon(await verarbeiteHiorgKalender(anfrage(), umgebung));

    expect(eintrag).not.toHaveProperty('enddate');
  });

  it('lässt ein enddate vor dem Beginn weg', async () => {
    feed(rohEintrag({ sortdate: 1789282800, enddate: 1789000000 }));

    const [eintrag] = await eintraegeVon(await verarbeiteHiorgKalender(anfrage(), umgebung));

    expect(eintrag).not.toHaveProperty('enddate');
  });

  it.each([
    ['ohne verbez', { verbez: '' }],
    ['mit unbekanntem typ', { typ: 'kurs' }],
    ['mit sortdate als Text', { sortdate: '1789282800' }],
    ['ohne id', { id: null }],
  ])('überspringt einen kaputten Datensatz (%s), behält den Rest', async (_fall, zusatz) => {
    feed(rohEintrag(zusatz), rohEintrag({ id: 1000002, verbez: 'Zweite erfundene Ausbildung' }));

    const eintraege = await eintraegeVon(await verarbeiteHiorgKalender(anfrage(), umgebung));

    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toMatchObject({ id: 1000002 });
  });
});

describe('HiOrg-Kalender: Ereignis-Link', () => {
  it('liefert die Ereignis-URL entitätenfrei', async () => {
    const [eintrag] = await eintraegeVon(await verarbeiteHiorgKalender(anfrage(), umgebung));

    expect(eintrag?.['url']).toBe(
      'https://www.hiorg-server.de/formulare.php?ovx=test&rt=t&ri=1000001',
    );
  });

  it.each([
    ['fremder Host', 'https://beispiel.invalid/formulare.php?ri=1'],
    ['ohne TLS', 'http://www.hiorg-server.de/formulare.php?ri=1'],
    ['mit Userinfo', 'https://nutzer:geheim@www.hiorg-server.de/formulare.php'],
    ['kein URL', 'javascript:alert(1)'],
  ])('lässt einen unbrauchbaren Link (%s) weg, behält den Eintrag', async (_fall, url) => {
    feed(rohEintrag({ url }));

    const [eintrag] = await eintraegeVon(await verarbeiteHiorgKalender(anfrage(), umgebung));

    expect(eintrag).toMatchObject({ verbez: 'Erfundene Ausbildung Verpflegung' });
    expect(eintrag).not.toHaveProperty('url');
  });
});
