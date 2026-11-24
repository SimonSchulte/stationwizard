import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verarbeiteVorgaenge } from '../src/vorgaenge';
import { SqliteD1 } from './sqlite-d1';

const FAHRZEUG = '11111111-1111-4111-8111-111111111111';
const TIM = { email: 'tim.beispiel@example.test' };
const MELDUNG = {
  art: 'schaden',
  datumFeststellung: '2026-11-12',
  einheit: 'BI EE 04',
  bezeichnung: 'GW SAN',
  kennzeichen: 'XX-HS 110',
  ort: '',
  sachverhalt: 'Das Stromaggregat springt nicht an.',
  stellungnahme: 'Der Sachverhalt wird wie oben beschrieben bestätigt.',
  empfehlung: '',
};
const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46,
]);
const PDF_BASE64 = btoa(String.fromCharCode(...PDF_BYTES));

let fahrzeuge: SqliteD1;
let benutzer: SqliteD1;
let r2: {
  objekte: Map<string, Uint8Array>;
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};
let fetchMock: ReturnType<typeof vi.fn>;

function umgebung(ueberschreibung: Record<string, unknown> = {}) {
  return {
    FAHRZEUGE_DB: fahrzeuge as never,
    BENUTZER_DB: benutzer as never,
    VORGAENGE_DATEIEN: r2 as never,
    MAIL_ABSENDER: 'absender@example.test',
    MAIL_API_TOKEN: 'geheimes-token-123',
    ...ueberschreibung,
  };
}

async function rufe(
  methode: string,
  pfad: string,
  optionen: { koerper?: unknown; ifMatch?: string; ifNoneMatch?: string } = {},
  env = umgebung(),
) {
  const headers: Record<string, string> = {};
  if (optionen.koerper !== undefined) headers['Content-Type'] = 'application/json';
  if (optionen.ifMatch) headers['If-Match'] = optionen.ifMatch;
  if (optionen.ifNoneMatch) headers['If-None-Match'] = optionen.ifNoneMatch;
  const antwort = await verarbeiteVorgaenge(
    new Request(`https://stationwizard.example.test${pfad}`, {
      method: methode,
      headers,
      body: optionen.koerper === undefined ? undefined : JSON.stringify(optionen.koerper),
    }),
    env,
    TIM,
  );
  const text = await antwort.text();
  return {
    status: antwort.status,
    diagnose: antwort.headers.get('X-Stationwizard-Diagnose'),
    json: text ? (JSON.parse(text) as Record<string, any>) : null,
  };
}

function einstellung(schluessel: string, wert: string) {
  benutzer.db
    .prepare(
      'INSERT OR REPLACE INTO systemkonfiguration (schluessel, wert, geaendert_am, geaendert_von) VALUES (?, ?, ?, ?)',
    )
    .run(schluessel, wert, '2026-01-01', 'test');
}

/** Ein Vorgang, wie er unmittelbar vor dem Einreichen steht: unterschrieben, ein Angebot, Stufe 1. */
async function bereiterVorgang(
  optionen: { pflicht?: number; stufe?: number; angebot?: boolean } = {},
) {
  const angelegt = await rufe('POST', '/api/vorgaenge', {
    koerper: { fahrzeugId: FAHRZEUG, titel: 'Stromaggregat defekt', meldung: MELDUNG },
    ifNoneMatch: '*',
  });
  const id = angelegt.json?.['vorgang'].id as string;
  const meldungId = angelegt.json?.['meldung'].id as string;
  const slots = ['fest', 'verantw'].slice(0, optionen.pflicht ?? 2);
  for (const slot of slots) {
    fahrzeuge.db
      .prepare(
        `INSERT INTO meldung_unterschriften (meldung_id, slot, status, an_email, name, unterschrieben_am, signatur)
         VALUES (?, ?, 'unterschrieben', 'x@example.test', 'Tim Beispiel', '2026-11-12', '{"art":"schrift","text":"Tim","font":"Caveat"}')`,
      )
      .run(meldungId, slot);
  }
  if (optionen.angebot !== false) {
    const angebotId = crypto.randomUUID();
    r2.objekte.set('vorgaenge/angebot', new Uint8Array([1, 2, 3, 4]));
    fahrzeuge.db
      .prepare(
        `INSERT INTO vorgang_angebote (id, vorgang_id, dateiname, groesse, r2_schluessel, quelle, hochgeladen_am, hochgeladen_von)
         VALUES (?, ?, 'angebot.pdf', 4, 'vorgaenge/angebot', 'upload', '2026-11-13', 'x')`,
      )
      .run(angebotId, id);
  }
  fahrzeuge.db
    .prepare('UPDATE vorgaenge SET stufe = ?, version = 5 WHERE id = ?')
    .run(optionen.stufe ?? 1, id);
  const angebote = fahrzeuge.db
    .prepare('SELECT id FROM vorgang_angebote WHERE vorgang_id = ?')
    .all(id) as { id: string }[];
  return { id, version: 5, angebotIds: angebote.map((a) => a.id) };
}

const senden = (id: string, version: number, koerper: Record<string, unknown> = {}) =>
  rufe('POST', `/api/vorgaenge/${id}/einreichen`, {
    koerper: {
      modus: 'einreichen',
      pdf: PDF_BASE64,
      empfaenger: ['fahrzeugwesen@example.test'],
      angebote: [],
      nachricht: '',
      ...koerper,
    },
    ifMatch: `"${version}"`,
  });

beforeEach(() => {
  fahrzeuge = new SqliteD1(['fahrzeuge']);
  benutzer = new SqliteD1(['benutzer']);
  fahrzeuge.db
    .prepare(
      `INSERT INTO fahrzeuge (id, bezeichnung, funkrufname, kennzeichen, eigentuemer, bemerkung, wartungstermine, geaendert_am, geaendert_von)
       VALUES (?, 'GW SAN', 'Florian 1', 'XX-HS 110', 'organisation', '', '[]', '2026-01-01', 'x')`,
    )
    .run(FAHRZEUG);
  r2 = {
    objekte: new Map(),
    put: vi.fn(
      async (schluessel: string, bytes: Uint8Array) => void r2.objekte.set(schluessel, bytes),
    ),
    get: vi.fn(async (schluessel: string) => {
      const bytes = r2.objekte.get(schluessel);
      return bytes ? { arrayBuffer: async () => bytes.slice().buffer } : null;
    }),
  };
  einstellung('vorgang_empfaenger', 'fahrzeugwesen@example.test, zugfuehrung@example.test');
  einstellung('vorgang_versandweg', 'resend');
  fetchMock = vi.fn(async () => new Response('{"id":"x"}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('Meldung einreichen', () => {
  it('sendet die Mail mit PDF-Anhang und setzt erst danach die Stufe „Eingereicht“', async () => {
    const { id, version } = await bereiterVorgang();
    const antwort = await senden(id, version, {
      empfaenger: ['fahrzeugwesen@example.test', 'zugfuehrung@example.test'],
      nachricht: 'Bitte prüfen.',
    });
    expect(antwort.status).toBe(200);
    expect(antwort.json?.['vorgang'].stufe).toBe(2);
    expect(antwort.json?.['meldung'].versendetAn).toEqual([
      'fahrzeugwesen@example.test',
      'zugfuehrung@example.test',
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const gesendet = JSON.parse(init.body as string);
    expect(gesendet.to).toEqual(['fahrzeugwesen@example.test', 'zugfuehrung@example.test']);
    expect(gesendet.subject).toBe('Schadens- und Verlustmeldung: GW SAN (XX-HS 110)');
    expect(gesendet.attachments).toEqual([
      { filename: 'schadensmeldung.pdf', content: PDF_BASE64 },
    ]);
    expect(gesendet.text).toContain('Bitte prüfen.');
    expect(gesendet.text).toContain('Gesendet von Tim Beispiel.');

    // Unveränderliche Kopie des Gesendeten.
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(r2.put.mock.calls[0][0]).toMatch(
      new RegExp(`^vorgaenge/${id}/meldung-[0-9a-f]{16}\\.pdf$`),
    );
    expect(antwort.json?.['ereignisse'][0].beschreibung).toContain('Eingereicht');
  });

  it('hängt gewählte Angebote an', async () => {
    const { id, version, angebotIds } = await bereiterVorgang();
    const antwort = await senden(id, version, { angebote: angebotIds });
    expect(antwort.status).toBe(200);
    const gesendet = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(gesendet.attachments).toHaveLength(2);
    expect(gesendet.attachments[1]).toEqual({
      filename: 'angebot.pdf',
      content: btoa(String.fromCharCode(1, 2, 3, 4)),
    });
  });

  it('nimmt keine Angebote eines anderen Vorgangs an', async () => {
    const erster = await bereiterVorgang();
    const zweiter = await bereiterVorgang();
    const antwort = await senden(zweiter.id, zweiter.version, { angebote: erster.angebotIds });
    expect(antwort.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lässt nur Empfänger aus der Systemkonfiguration zu', async () => {
    const { id, version } = await bereiterVorgang();
    const antwort = await senden(id, version, { empfaenger: ['fremd@example.test'] });
    expect(antwort.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sperrt ohne festgelegte Empfänger', async () => {
    einstellung('vorgang_empfaenger', '');
    const { id, version } = await bereiterVorgang();
    expect((await senden(id, version)).diagnose).toBe('VORGANG_EMPFAENGER_FEHLT');
  });

  it('verlangt beide Pflichtunterschriften, ein Angebot und die Stufe „Angebote eingeholt“', async () => {
    const einzel = await bereiterVorgang({ pflicht: 1 });
    expect((await senden(einzel.id, einzel.version)).diagnose).toBe(
      'VORGANG_UNTERSCHRIFT_FEHLT_ZUM_SENDEN',
    );
    const ohneAngebot = await bereiterVorgang({ angebot: false });
    expect((await senden(ohneAngebot.id, ohneAngebot.version)).diagnose).toBe(
      'VORGANG_ANGEBOT_FEHLT',
    );
    const stufeNull = await bereiterVorgang({ stufe: 0 });
    expect((await senden(stufeNull.id, stufeNull.version)).diagnose).toBe('VORGANG_STUFE_FEHLT');
    const schonDa = await bereiterVorgang({ stufe: 2 });
    expect((await senden(schonDa.id, schonDa.version)).diagnose).toBe(
      'VORGANG_BEREITS_EINGEREICHT',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prüft die Version und das PDF', async () => {
    const { id, version } = await bereiterVorgang();
    expect((await senden(id, version + 1)).status).toBe(412);
    expect((await senden(id, version, { pdf: btoa('kein pdf!!!') })).status).toBe(400);
    expect((await senden(id, version, { pdf: '***' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lässt den Stand unverändert, wenn der Versand scheitert, und nennt den festen Code', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { id, version } = await bereiterVorgang();
    const antwort = await senden(id, version);
    expect(antwort.status).toBe(502);
    expect(antwort.diagnose).toBe('MAIL_VERSAND_ZUGANG_ABGELEHNT');
    const stand = await rufe('GET', `/api/vorgaenge/${id}`);
    expect(stand.json?.['vorgang'].stufe).toBe(1);
    expect(stand.json?.['meldung'].versendetAm).toBeNull();
    expect(r2.put).not.toHaveBeenCalled();
  });

  it('sendet im Modus „senden“ ohne die Stufe zu ändern', async () => {
    const { id, version } = await bereiterVorgang({ stufe: 3 });
    const antwort = await senden(id, version, { modus: 'senden' });
    expect(antwort.status).toBe(200);
    expect(antwort.json?.['vorgang'].stufe).toBe(3);
    expect(antwort.json?.['meldung'].versendetAm).not.toBeNull();
  });

  it('kommt ohne eingerichteten Dateispeicher aus, solange keine Angebote anhängen', async () => {
    const { id, version, angebotIds } = await bereiterVorgang();
    const env = umgebung({ VORGAENGE_DATEIEN: undefined });
    const ohneAnhang = await rufe(
      'POST',
      `/api/vorgaenge/${id}/einreichen`,
      {
        koerper: {
          modus: 'einreichen',
          pdf: PDF_BASE64,
          empfaenger: ['fahrzeugwesen@example.test'],
          angebote: [],
          nachricht: '',
        },
        ifMatch: `"${version}"`,
      },
      env,
    );
    expect(ohneAnhang.status).toBe(200);

    const zweiter = await bereiterVorgang();
    const mitAnhang = await rufe(
      'POST',
      `/api/vorgaenge/${zweiter.id}/einreichen`,
      {
        koerper: {
          modus: 'einreichen',
          pdf: PDF_BASE64,
          empfaenger: ['fahrzeugwesen@example.test'],
          angebote: zweiter.angebotIds,
          nachricht: '',
        },
        ifMatch: `"${zweiter.version}"`,
      },
      env,
    );
    expect(mitAnhang.status).toBe(503);
    expect(angebotIds).toHaveLength(1);
  });

  it('lehnt Anhänge über Email Routing mit festem Code ab', async () => {
    einstellung('vorgang_versandweg', 'email-routing');
    const binding = { send: vi.fn(async () => undefined) };
    const { id, version } = await bereiterVorgang();
    const antwort = await rufe(
      'POST',
      `/api/vorgaenge/${id}/einreichen`,
      {
        koerper: {
          modus: 'einreichen',
          pdf: PDF_BASE64,
          empfaenger: ['fahrzeugwesen@example.test'],
          angebote: [],
          nachricht: '',
        },
        ifMatch: `"${version}"`,
      },
      umgebung({ MAIL_ROUTING: binding }),
    );
    expect(antwort.status).toBe(422);
    expect(antwort.diagnose).toBe('MAIL_VERSAND_ANHANG_NICHT_UNTERSTUETZT');
    expect(binding.send).not.toHaveBeenCalled();
  });
});
