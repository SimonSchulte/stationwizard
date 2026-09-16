import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  istOeffentlicherPfad,
  OEFFENTLICHE_DATEIEN,
  verarbeiteOeffentlicheErfassung,
} from '../src/oeffentliche-erfassung';
import { FakeFahrzeugeDb } from './fahrzeug-db-fake';

const URSPRUNG = 'https://stationwizard.example.test';
const TOKEN = 'a'.repeat(32);
const ANDERES_TOKEN = 'b'.repeat(32);
const FAHRZEUG_ID = '01234567-89ab-4cde-8fab-0123456789ab';

/** Assets-Attrappe: kennt genau die Dateien des zweiten Build-Ziels. */
function assets(dateien: Record<string, { typ: string; inhalt: string }>) {
  return {
    fetch: async (anfrage: Request) => {
      const pfad = new URL(anfrage.url).pathname;
      const datei = dateien[pfad];
      if (datei) {
        return new Response(datei.inhalt, { headers: { 'Content-Type': datei.typ } });
      }
      // Genau das tut `not_found_handling = "single-page-application"`: es
      // liefert die index.html der geschützten Hauptanwendung mit Status 200.
      return new Response('<html>GESCHUETZTE APP-HUELLE</html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  } as unknown as Fetcher;
}

const STANDARD_ASSETS = assets({
  '/oeffentlich/index.html': { typ: 'text/html; charset=utf-8', inhalt: '<html>meldung</html>' },
  '/oeffentlich/main.js': { typ: 'text/javascript', inhalt: 'console.log(1)' },
  '/oeffentlich/styles.css': { typ: 'text/css', inhalt: 'body{}' },
});

function db(): FakeFahrzeugeDb {
  const datenbank = new FakeFahrzeugeDb();
  datenbank.fahrzeuge.set(FAHRZEUG_ID, {
    id: FAHRZEUG_ID,
    bezeichnung: 'MTW Übung 1',
    funkrufname: 'Florian Testort 1/85/1',
    kennzeichen: 'XY-TE 123',
    fahrgestellnummer: null,
    eigentuemer: 'organisation',
    gruppe: 'fuehrung',
    bemerkung: 'interne Notiz, nicht öffentlich',
    wartungstermine: '[]',
    geaendert_am: '2026-09-01T10:00:00.000Z',
    geaendert_von: 'geprueft@example.test',
    version: 1,
    erfassung_token: TOKEN,
    erfassung_token_am: '2026-09-01T10:00:00.000Z',
  });
  return datenbank;
}

async function ruf(
  pfad: string,
  init: RequestInit = {},
  umgebung: Record<string, unknown> = {},
): Promise<Response> {
  const url = new URL(`${URSPRUNG}${pfad}`);
  return verarbeiteOeffentlicheErfassung(
    new Request(url, init),
    { ASSETS: STANDARD_ASSETS, ...umgebung } as never,
    url,
  );
}

function meldung(koerper: unknown, kopf: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: URSPRUNG,
      'Sec-Fetch-Site': 'same-origin',
      ...kopf,
    },
    body: JSON.stringify(koerper),
  };
}

afterEach(() => vi.useRealTimers());

describe('istOeffentlicherPfad', () => {
  it('erkennt genau die drei vorgesehenen Formen', () => {
    expect(istOeffentlicherPfad(`/e/${TOKEN}`)).toBe(true);
    expect(istOeffentlicherPfad('/oeffentlich/main.js')).toBe(true);
    expect(istOeffentlicherPfad(`/api/oeffentlich/meldung/${TOKEN}`)).toBe(true);
  });

  it('lässt keinen Beinahetreffer durch', () => {
    // Der Wert dieses Tests: der Bypass darf nicht über Pfadvarianten wachsen.
    for (const pfad of [
      '/e/',
      '/e',
      '/e/zu-kurz',
      `/e/${TOKEN}/`,
      `/e/${TOKEN}/extra`,
      `/e/${TOKEN}.json`,
      `/e/${TOKEN}a`,
      `/e/${'A'.repeat(32)}`,
      `/ef/${TOKEN}`,
      '/oeffentlich/',
      '/oeffentlich/unter/main.js',
      '/oeffentlich/../index.html',
      '/api/oeffentlich/meldung',
      `/api/oeffentlich/meldung/${TOKEN}/extra`,
      '/api/oeffentlich/anderes',
      '/',
      '/api/status',
      '/main-ABC123.js',
    ]) {
      expect(istOeffentlicherPfad(pfad), pfad).toBe(false);
    }
  });
});

describe('Seite und Dateien', () => {
  it('liefert die Meldeseite für jede formal gültige Tokenform', async () => {
    const antwort = await ruf(`/e/${ANDERES_TOKEN}`);
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toContain('text/html');
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(antwort.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(antwort.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('liefert die Dateien des zweiten Build-Ziels', async () => {
    for (const datei of Object.keys(OEFFENTLICHE_DATEIEN)) {
      const antwort = await ruf(`/oeffentlich/${datei}`);
      expect(antwort.status, datei).toBe(200);
      expect(antwort.headers.get('Content-Type'), datei).toBe(OEFFENTLICHE_DATEIEN[datei]);
    }
  });

  it('gibt eine nicht gelistete Datei nicht heraus', async () => {
    for (const datei of ['3rdpartylicenses.txt', 'prerendered-routes.json', 'favicon.ico']) {
      expect((await ruf(`/oeffentlich/${datei}`)).status, datei).toBe(404);
    }
  });

  it('liefert niemals die geschützte App-Hülle, wenn eine Datei fehlt', async () => {
    // Zweiter Riegel: die SPA-Rückfallebene antwortet mit Status 200 und HTML.
    const leer = assets({});
    const antwort = await ruf('/oeffentlich/main.js', {}, { ASSETS: leer });
    expect(antwort.status).toBe(404);
    expect(await antwort.text()).not.toContain('GESCHUETZTE APP-HUELLE');
  });

  it('weist schreibende Methoden auf Dateien ab', async () => {
    const antwort = await ruf('/oeffentlich/main.js', { method: 'POST' });
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET, HEAD');
  });
});

describe('Fahrzeugangaben', () => {
  it('nennt nur Bezeichnung, Funkrufname und Kennzeichen', async () => {
    const antwort = await ruf(`/api/oeffentlich/meldung/${TOKEN}`, {}, { FAHRZEUGE_DB: db() });
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({
      bezeichnung: 'MTW Übung 1',
      funkrufname: 'Florian Testort 1/85/1',
      kennzeichen: 'XY-TE 123',
    });
  });

  it('gibt weder UUID noch Bemerkung, Gruppe oder E-Mail preis', async () => {
    const antwort = await ruf(`/api/oeffentlich/meldung/${TOKEN}`, {}, { FAHRZEUGE_DB: db() });
    const roh = await antwort.text();
    expect(roh).not.toContain(FAHRZEUG_ID);
    expect(roh).not.toContain('interne Notiz');
    expect(roh).not.toContain('geprueft@example.test');
    expect(roh).not.toContain('fuehrung');
    expect(roh).not.toContain(TOKEN);
  });

  it('antwortet auf ein unbekanntes Token genau wie auf ein ungültiges', async () => {
    // Kein Orakel: beide Fälle sind byteweise ununterscheidbar.
    const unbekannt = await ruf(
      `/api/oeffentlich/meldung/${ANDERES_TOKEN}`,
      {},
      { FAHRZEUGE_DB: db() },
    );
    const ohneDb = await ruf(
      `/api/oeffentlich/meldung/${'c'.repeat(32)}`,
      {},
      {
        FAHRZEUGE_DB: new FakeFahrzeugeDb(),
      },
    );
    expect(unbekannt.status).toBe(ohneDb.status);
    expect(await unbekannt.text()).toBe(await ohneDb.text());
    expect(unbekannt.headers.get('X-Stationwizard-Diagnose')).toBe(
      ohneDb.headers.get('X-Stationwizard-Diagnose'),
    );
    expect(unbekannt.status).toBe(404);
  });

  it('sperrt ohne Datenbankbindung, statt abzustürzen', async () => {
    const antwort = await ruf(`/api/oeffentlich/meldung/${TOKEN}`);
    expect(antwort.status).toBe(503);
    expect(await antwort.json()).toMatchObject({ code: 'MELDUNG_KONFIGURATION_FEHLT' });
  });
});

describe('Meldung annehmen', () => {
  it('legt eine Einreichung an – und niemals eine Ablesung', async () => {
    const datenbank = db();
    const antwort = await ruf(
      `/api/oeffentlich/meldung/${TOKEN}`,
      meldung({ name: 'Maxi Muster', stand: 12_345, bemerkung: 'Tank voll' }),
      { FAHRZEUGE_DB: datenbank },
    );
    expect(antwort.status).toBe(201);
    expect(await antwort.json()).toEqual({ status: 'eingereicht' });

    expect(datenbank.ablesungen).toHaveLength(0);
    expect(datenbank.einreichungen).toHaveLength(1);
    expect(datenbank.einreichungen[0]).toMatchObject({
      fahrzeug_id: FAHRZEUG_ID,
      stand: 12_345,
      eingereicht_von_name: 'Maxi Muster',
      bemerkung: 'Tank voll',
      status: 'offen',
      entschieden_von: null,
      ablesung_id: null,
    });
  });

  it('setzt den Ablesetag als Berliner Kalendertag, nicht als UTC-Tag', async () => {
    vi.useFakeTimers();
    // 23:30 Uhr UTC am 14.09. ist in Berlin bereits der 15.09.
    vi.setSystemTime(new Date('2026-09-14T23:30:00Z'));
    const datenbank = db();
    await ruf(`/api/oeffentlich/meldung/${TOKEN}`, meldung({ name: 'Maxi', stand: 1 }), {
      FAHRZEUGE_DB: datenbank,
    });
    expect(datenbank.einreichungen[0]?.abgelesen_am).toBe('2026-09-15');
  });

  it('weist eine Meldung ohne passenden Ursprung ab', async () => {
    const datenbank = db();
    for (const kopf of [
      { Origin: 'https://fremde-seite.example' },
      { Origin: '' },
      { 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const antwort = await ruf(
        `/api/oeffentlich/meldung/${TOKEN}`,
        meldung({ name: 'Maxi', stand: 1 }, kopf),
        { FAHRZEUGE_DB: datenbank },
      );
      expect(antwort.status, JSON.stringify(kopf)).toBe(403);
    }
    expect(datenbank.einreichungen).toHaveLength(0);
  });

  it('weist eine Meldung ohne Origin-Kopf ab', async () => {
    // Strenger als die globale Prüfung in index.ts: die Seite sendet garantiert
    // aus einem Browser derselben Origin.
    const datenbank = db();
    const antwort = await verarbeiteOeffentlicheErfassung(
      new Request(`${URSPRUNG}/api/oeffentlich/meldung/${TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      { FAHRZEUGE_DB: datenbank } as never,
      new URL(`${URSPRUNG}/api/oeffentlich/meldung/${TOKEN}`),
    );
    expect(antwort.status).toBe(403);
  });

  it('verlangt genau application/json', async () => {
    const antwort = await ruf(
      `/api/oeffentlich/meldung/${TOKEN}`,
      meldung({ name: 'Maxi', stand: 1 }, { 'Content-Type': 'text/plain' }),
      { FAHRZEUGE_DB: db() },
    );
    expect(antwort.status).toBe(415);
  });

  it('weist einen zu großen Körper ab', async () => {
    const antwort = await ruf(
      `/api/oeffentlich/meldung/${TOKEN}`,
      meldung({ name: 'Maxi', stand: 1, bemerkung: 'x'.repeat(4096) }),
      { FAHRZEUGE_DB: db() },
    );
    expect(antwort.status).toBe(413);
  });

  it('hält die Feldgrenzen ein', async () => {
    const datenbank = db();
    const ungueltig = [
      { name: 'M', stand: 1 },
      { name: 'x'.repeat(61), stand: 1 },
      { name: 'Maxi', stand: -1 },
      { name: 'Maxi', stand: 1.5 },
      { name: 'Maxi', stand: 10_000_000 },
      { name: 'Maxi', stand: '123' },
      { name: 'Maxi' },
      { stand: 1 },
      { name: 'Maxi', stand: 1, bemerkung: 'x'.repeat(201) },
    ];
    for (const koerper of ungueltig) {
      const antwort = await ruf(`/api/oeffentlich/meldung/${TOKEN}`, meldung(koerper), {
        FAHRZEUGE_DB: datenbank,
      });
      expect(antwort.status, JSON.stringify(koerper)).toBe(400);
    }
    expect(datenbank.einreichungen).toHaveLength(0);
  });

  it('ersetzt Steuerzeichen im Namen, statt sie zu übernehmen', async () => {
    const datenbank = db();
    await ruf(
      `/api/oeffentlich/meldung/${TOKEN}`,
      meldung({ name: ' Maxi\nMuster\t ', stand: 1 }),
      { FAHRZEUGE_DB: datenbank },
    );
    expect(datenbank.einreichungen[0]?.eingereicht_von_name).toBe('Maxi Muster');
  });

  it('verrät über ein ungültiges Token auch beim Melden nichts', async () => {
    const datenbank = db();
    const antwort = await ruf(
      `/api/oeffentlich/meldung/${ANDERES_TOKEN}`,
      meldung({ name: 'Maxi', stand: 1 }),
      { FAHRZEUGE_DB: datenbank },
    );
    expect(antwort.status).toBe(404);
    expect(await antwort.json()).toMatchObject({ code: 'MELDUNG_UNBEKANNT' });
    expect(datenbank.einreichungen).toHaveLength(0);
  });

  it('bremst wiederholte Meldungen für dasselbe Fahrzeug', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
    const datenbank = db();
    const senden = () =>
      ruf(`/api/oeffentlich/meldung/${TOKEN}`, meldung({ name: 'Maxi', stand: 1 }), {
        FAHRZEUGE_DB: datenbank,
      });

    expect((await senden()).status).toBe(201);
    vi.setSystemTime(new Date('2026-09-15T10:00:30Z'));
    const zuFrueh = await senden();
    expect(zuFrueh.status).toBe(429);
    expect(zuFrueh.headers.get('Retry-After')).toBe('60');
    expect(await zuFrueh.json()).toMatchObject({ code: 'MELDUNG_ZU_HAEUFIG' });

    vi.setSystemTime(new Date('2026-09-15T10:01:30Z'));
    expect((await senden()).status).toBe(201);
    expect(datenbank.einreichungen).toHaveLength(2);
  });

  it('deckelt die Zahl offener Meldungen je Fahrzeug', async () => {
    vi.useFakeTimers();
    const datenbank = db();
    for (let i = 0; i < 5; i += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, i * 2)));
      const antwort = await ruf(
        `/api/oeffentlich/meldung/${TOKEN}`,
        meldung({ name: 'Maxi', stand: 100 + i }),
        { FAHRZEUGE_DB: datenbank },
      );
      expect(antwort.status, `Meldung ${i}`).toBe(201);
    }
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 11, 0)));
    const zuviel = await ruf(
      `/api/oeffentlich/meldung/${TOKEN}`,
      meldung({ name: 'Maxi', stand: 999 }),
      { FAHRZEUGE_DB: datenbank },
    );
    expect(zuviel.status).toBe(429);
    expect(zuviel.headers.get('Retry-After')).toBe('3600');
    expect(await zuviel.json()).toMatchObject({ code: 'MELDUNG_ZU_VIELE_OFFEN' });
    expect(datenbank.einreichungen).toHaveLength(5);
  });

  it('weist unerlaubte Methoden ab', async () => {
    const antwort = await ruf(
      `/api/oeffentlich/meldung/${TOKEN}`,
      { method: 'DELETE' },
      {
        FAHRZEUGE_DB: db(),
      },
    );
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET, HEAD, POST');
  });
});
