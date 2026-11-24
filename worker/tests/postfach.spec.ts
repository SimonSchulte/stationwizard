import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verarbeitePostfach } from '../src/postfach';
import { verarbeiteEingehendeMail, type EingehendeMail } from '../src/postfach-eingang';
import { dekodiereKopfzeile, kuerzelAusBezeichnung } from '../src/postfach-gemeinsam';
import { verarbeiteVorgaenge } from '../src/vorgaenge';
import { angebotTyp, bereinigeDateiname } from '../src/vorgaenge-angebote';
import { SqliteD1 } from './sqlite-d1';

const F_SAN = '11111111-1111-4111-8111-111111111111';
const F_KTW = '22222222-2222-4222-8222-222222222222';
const ZORA = { email: 'zora.muster@example.test' }; // Zugführung
const TIM = { email: 'tim.beispiel@example.test' }; // Gruppenführung Sanität
const MAX = { email: 'max.mustermann@example.test' }; // ohne Rolle
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const MELDUNG = {
  art: 'schaden',
  datumFeststellung: '2026-11-12',
  einheit: 'BI EE 04',
  bezeichnung: 'GW SAN',
  kennzeichen: 'XX-HS 110',
  ort: '',
  sachverhalt: 'Defekt.',
  stellungnahme: '',
  empfehlung: '',
};

let fahrzeuge: SqliteD1;
let benutzer: SqliteD1;
let r2: {
  objekte: Map<string, Uint8Array>;
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function umgebung(ueberschreibung: Record<string, unknown> = {}) {
  return {
    FAHRZEUGE_DB: fahrzeuge as never,
    BENUTZER_DB: benutzer as never,
    VORGAENGE_DATEIEN: r2 as never,
    ...ueberschreibung,
  };
}

function person(email: string, rolle: string | null) {
  benutzer.db
    .prepare(
      "INSERT INTO benutzer (email, rolle, sonderrollen, erster_zugriff_am, letzter_zugriff_am) VALUES (?, ?, '[]', '2026-01-01', '2026-01-01')",
    )
    .run(email, rolle);
}

function mail(optionen: {
  an: string;
  id?: string;
  betreff?: string;
  groesse?: number;
}): EingehendeMail & { abgelehnt: string[] } {
  const roh = new TextEncoder().encode(`Subject: ${optionen.betreff ?? 'Angebot'}\r\n\r\nInhalt`);
  const abgelehnt: string[] = [];
  return {
    from: 'werkstatt@example.test',
    to: optionen.an,
    headers: new Headers({
      'message-id': optionen.id ?? `<${crypto.randomUUID()}@example.test>`,
      subject: optionen.betreff ?? 'Angebot',
    }),
    rawSize: optionen.groesse ?? roh.byteLength,
    raw: new Response(roh).body as ReadableStream<Uint8Array>,
    setReject: (grund: string) => void abgelehnt.push(grund),
    abgelehnt,
  };
}

async function rufe(
  identitaet: { email: string },
  methode: string,
  pfad: string,
  optionen: { koerper?: unknown; bytes?: Uint8Array; kopf?: Record<string, string> } = {},
  env = umgebung(),
) {
  const headers: Record<string, string> = { ...(optionen.kopf ?? {}) };
  if (optionen.koerper !== undefined) headers['Content-Type'] = 'application/json';
  const antwort = await (
    pfad.startsWith('/api/postfach') ? verarbeitePostfach : verarbeiteVorgaenge
  )(
    new Request(`https://hiorg-wache.example.test${pfad}`, {
      method: methode,
      headers,
      body:
        optionen.bytes ??
        (optionen.koerper === undefined ? undefined : JSON.stringify(optionen.koerper)),
    }),
    env,
    identitaet,
  );
  const typ = antwort.headers.get('Content-Type') ?? '';
  return {
    status: antwort.status,
    diagnose: antwort.headers.get('X-Stationwizard-Diagnose'),
    json: typ.includes('json') ? ((await antwort.json()) as Record<string, any>) : null,
    bytes: typ.includes('json') ? null : new Uint8Array(await antwort.arrayBuffer()),
  };
}

beforeEach(() => {
  fahrzeuge = new SqliteD1(['fahrzeuge']);
  benutzer = new SqliteD1(['benutzer']);
  r2 = {
    objekte: new Map(),
    put: vi.fn(async (k: string, b: Uint8Array) => void r2.objekte.set(k, b)),
    get: vi.fn(async (k: string) => {
      const b = r2.objekte.get(k);
      return b ? { arrayBuffer: async () => b.slice().buffer, body: new Response(b).body } : null;
    }),
    delete: vi.fn(async (k: string) => void r2.objekte.delete(k)),
  };
  const f = fahrzeuge.db.prepare(
    `INSERT INTO fahrzeuge (id, bezeichnung, funkrufname, kennzeichen, eigentuemer, bemerkung, wartungstermine, geaendert_am, geaendert_von, gruppe)
     VALUES (?, ?, 'x', ?, 'organisation', '', '[]', '2026-01-01', 'x', ?)`,
  );
  f.run(F_SAN, 'GW SAN', 'XX-HS 110', 'sanitaet');
  f.run(F_KTW, 'KTW-B 1', 'XX-HS 101', 'tesi');
  person(ZORA.email, 'zugfuehrung');
  person(TIM.email, 'gruppenfuehrung-sanitaet');
  person(MAX.email, null);
});

async function adressen() {
  return (await rufe(ZORA, 'GET', '/api/postfach/adressen')).json as {
    sammelAdresse: string;
    adressen: { kuerzel: string; fahrzeugId: string; adresse: string }[];
  };
}

describe('Hilfsfunktionen', () => {
  it('bildet Kürzel aus Bezeichnungen', () => {
    expect(kuerzelAusBezeichnung('GW SAN')).toBe('gw-san');
    expect(kuerzelAusBezeichnung('KTW-B 1')).toBe('ktw-b-1');
    expect(kuerzelAusBezeichnung('Küchenwagen Ä')).toBe('kuechenwagen-ae');
    expect(kuerzelAusBezeichnung('!')).toBe('fahrzeug');
  });

  it('entschlüsselt kodierte Kopfzeilen', () => {
    expect(dekodiereKopfzeile('=?utf-8?B?QW5nZWJvdCBmw7xyIEdXIFNBTg==?=')).toBe(
      'Angebot für GW SAN',
    );
    expect(dekodiereKopfzeile('=?iso-8859-1?Q?Angebot_f=FCr_GW?=')).toBe('Angebot für GW');
    expect(dekodiereKopfzeile('Einfacher Betreff')).toBe('Einfacher Betreff');
  });

  it('erkennt Dateitypen an den ersten Bytes und prüft Dateinamen', () => {
    expect(angebotTyp(PDF)).toBe('pdf');
    expect(angebotTyp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'png',
    );
    expect(angebotTyp(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(angebotTyp(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBeNull();
    expect(bereinigeDateiname(encodeURIComponent('Angebot Üb.pdf'))).toBe('Angebot Üb.pdf');
    expect(bereinigeDateiname(encodeURIComponent('../a.pdf'))).toBeNull();
    expect(bereinigeDateiname('')).toBeNull();
  });
});

describe('Adressen', () => {
  it('legt Kürzel aus der Bezeichnung an und nennt Sammel- und Fahrzeugadressen', async () => {
    const stand = await adressen();
    expect(stand.sammelAdresse).toBe('angebote@hiorg-wache.example.test');
    expect(stand.adressen.map((a) => a.kuerzel)).toEqual(['gw-san', 'ktw-b-1']);
    expect(stand.adressen[0]?.adresse).toBe('gw-san@hiorg-wache.example.test');
  });

  it('hält Kürzel eindeutig, wenn zwei Fahrzeuge gleich heißen', async () => {
    fahrzeuge.db
      .prepare(
        `INSERT INTO fahrzeuge (id, bezeichnung, funkrufname, kennzeichen, eigentuemer, bemerkung, wartungstermine, geaendert_am, geaendert_von)
         VALUES ('33333333-3333-4333-8333-333333333333', 'GW SAN', 'x', 'XX-1', 'organisation', '', '[]', '2026-01-01', 'x')`,
      )
      .run();
    expect((await adressen()).adressen.map((a) => a.kuerzel).sort()).toEqual([
      'gw-san',
      'gw-san-2',
      'ktw-b-1',
    ]);
  });

  it('lässt nur die Zugführung ein Kürzel ändern und prüft Form und Eindeutigkeit', async () => {
    await adressen();
    expect(
      (await rufe(TIM, 'PUT', `/api/postfach/adressen/${F_SAN}`, { koerper: { kuerzel: 'neu' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await rufe(ZORA, 'PUT', `/api/postfach/adressen/${F_SAN}`, {
          koerper: { kuerzel: 'Neu Name' },
        })
      ).diagnose,
    ).toBe('POSTFACH_KUERZEL_UNGUELTIG');
    expect(
      (
        await rufe(ZORA, 'PUT', `/api/postfach/adressen/${F_SAN}`, {
          koerper: { kuerzel: 'angebote' },
        })
      ).diagnose,
    ).toBe('POSTFACH_KUERZEL_UNGUELTIG');
    expect(
      (
        await rufe(ZORA, 'PUT', `/api/postfach/adressen/${F_SAN}`, {
          koerper: { kuerzel: 'ktw-b-1' },
        })
      ).diagnose,
    ).toBe('POSTFACH_KUERZEL_VERGEBEN');
    expect(
      (
        await rufe(ZORA, 'PUT', `/api/postfach/adressen/${F_SAN}`, {
          koerper: { kuerzel: 'san-1' },
        })
      ).status,
    ).toBe(200);
    expect((await adressen()).adressen.find((a) => a.fahrzeugId === F_SAN)?.kuerzel).toBe('san-1');
  });
});

describe('Eingang', () => {
  it('legt die Rohmail in R2 und ordnet sie über das Kürzel dem Fahrzeug zu', async () => {
    await adressen();
    await verarbeiteEingehendeMail(
      mail({ an: 'GW-San@hiorg-wache.example.test', betreff: '=?utf-8?B?QW5nZWJvdA==?=' }),
      umgebung(),
    );
    const zeile = fahrzeuge.db.prepare('SELECT * FROM postfach_mails').get() as Record<string, any>;
    expect(zeile['fahrzeug_id']).toBe(F_SAN);
    expect(zeile['betreff']).toBe('Angebot');
    expect(r2.objekte.has(zeile['r2_schluessel'])).toBe(true);
  });

  it('lässt unbekannte Namen im Sammelpostfach ohne Fahrzeug landen', async () => {
    await verarbeiteEingehendeMail(mail({ an: 'irgendwer@hiorg-wache.example.test' }), umgebung());
    await verarbeiteEingehendeMail(mail({ an: 'angebote@hiorg-wache.example.test' }), umgebung());
    const zeilen = fahrzeuge.db.prepare('SELECT fahrzeug_id FROM postfach_mails').all() as {
      fahrzeug_id: string | null;
    }[];
    expect(zeilen.map((z) => z.fahrzeug_id)).toEqual([null, null]);
  });

  it('legt eine doppelt zugestellte Mail nur einmal an', async () => {
    await verarbeiteEingehendeMail(
      mail({ an: 'angebote@x.test', id: '<gleich@example.test>' }),
      umgebung(),
    );
    await verarbeiteEingehendeMail(
      mail({ an: 'angebote@x.test', id: '<gleich@example.test>' }),
      umgebung(),
    );
    expect(
      (fahrzeuge.db.prepare('SELECT COUNT(*) AS n FROM postfach_mails').get() as { n: number }).n,
    ).toBe(1);
    expect(r2.put).toHaveBeenCalledTimes(1);
  });

  it('lehnt zu große Mails und fehlende Einrichtung ab', async () => {
    const gross = mail({ an: 'angebote@x.test', groesse: 26 * 1024 * 1024 });
    await verarbeiteEingehendeMail(gross, umgebung());
    expect(gross.abgelehnt).toHaveLength(1);
    const ohne = mail({ an: 'angebote@x.test' });
    await verarbeiteEingehendeMail(ohne, umgebung({ VORGAENGE_DATEIEN: undefined }));
    expect(ohne.abgelehnt).toHaveLength(1);
    expect(
      (fahrzeuge.db.prepare('SELECT COUNT(*) AS n FROM postfach_mails').get() as { n: number }).n,
    ).toBe(0);
  });
});

describe('Postfach lesen und bearbeiten', () => {
  async function fuelle() {
    await adressen();
    await verarbeiteEingehendeMail(mail({ an: 'gw-san@x.test', betreff: 'SAN' }), umgebung());
    await verarbeiteEingehendeMail(mail({ an: 'ktw-b-1@x.test', betreff: 'KTW' }), umgebung());
    await verarbeiteEingehendeMail(mail({ an: 'angebote@x.test', betreff: 'Sammel' }), umgebung());
  }
  const betreffe = async (identitaet: { email: string }) =>
    (
      (await rufe(identitaet, 'GET', '/api/postfach/mails')).json?.['mails'] as {
        betreff: string;
      }[]
    )
      .map((m) => m.betreff)
      .sort();

  it('zeigt der Zugführung alles, der Gruppenführung nur Mails ihrer Gruppe, ohne Rolle nichts', async () => {
    await fuelle();
    expect(await betreffe(ZORA)).toEqual(['KTW', 'SAN', 'Sammel']);
    expect(await betreffe(TIM)).toEqual(['SAN']);
    expect(await betreffe(MAX)).toEqual([]);
  });

  it('antwortet für fremde Mails mit 404 statt 403', async () => {
    await fuelle();
    const sammel = (
      fahrzeuge.db.prepare("SELECT id FROM postfach_mails WHERE betreff = 'Sammel'").get() as {
        id: string;
      }
    ).id;
    expect((await rufe(TIM, 'GET', `/api/postfach/mails/${sammel}/datei`)).status).toBe(404);
    expect((await rufe(MAX, 'DELETE', `/api/postfach/mails/${sammel}`)).status).toBe(404);
    expect((await rufe(ZORA, 'GET', `/api/postfach/mails/${sammel}/datei`)).status).toBe(200);
  });

  it('liefert die Rohmail und löscht sie beim Verwerfen samt Absender und Betreff', async () => {
    await fuelle();
    const zeile = fahrzeuge.db
      .prepare("SELECT id, r2_schluessel FROM postfach_mails WHERE betreff = 'SAN'")
      .get() as { id: string; r2_schluessel: string };
    const datei = await rufe(TIM, 'GET', `/api/postfach/mails/${zeile.id}/datei`);
    expect(new TextDecoder().decode(datei.bytes as Uint8Array)).toContain('Inhalt');
    expect((await rufe(TIM, 'DELETE', `/api/postfach/mails/${zeile.id}`)).status).toBe(200);
    expect(r2.objekte.has(zeile.r2_schluessel)).toBe(false);
    const danach = fahrzeuge.db
      .prepare('SELECT status, betreff, absender, r2_schluessel FROM postfach_mails WHERE id = ?')
      .get(zeile.id);
    expect(danach).toMatchObject({
      status: 'verworfen',
      betreff: '',
      absender: '',
      r2_schluessel: null,
    });
    expect(await betreffe(TIM)).toEqual([]);
  });

  it('lässt offene Mails nach 30 Tagen verfallen', async () => {
    await fuelle();
    fahrzeuge.db
      .prepare(
        "UPDATE postfach_mails SET empfangen_am = '2020-01-01T00:00:00.000Z' WHERE betreff = 'SAN'",
      )
      .run();
    expect(await betreffe(ZORA)).toEqual(['KTW', 'Sammel']);
    expect(r2.delete).toHaveBeenCalled();
  });
});

describe('Angebote und Zuordnung', () => {
  async function vorgang() {
    const antwort = await rufe(ZORA, 'POST', '/api/vorgaenge', {
      koerper: { fahrzeugId: F_SAN, titel: 'Aggregat', meldung: MELDUNG },
      kopf: { 'If-None-Match': '*' },
    });
    expect(antwort.status).toBe(201);
    return antwort.json?.['vorgang'].id as string;
  }
  const hochladen = (
    id: string,
    bytes: Uint8Array,
    name = 'angebot.pdf',
    kopf: Record<string, string> = {},
    angebotId = crypto.randomUUID(),
  ) =>
    rufe(ZORA, 'PUT', `/api/vorgaenge/${id}/angebote/${angebotId}`, {
      bytes,
      kopf: {
        'If-None-Match': '*',
        'X-Stationwizard-Dateiname': encodeURIComponent(name),
        ...kopf,
      },
    });

  it('legt ein Angebot an, liefert es zurück und entfernt es wieder', async () => {
    const id = await vorgang();
    const angebotId = crypto.randomUUID();
    const antwort = await hochladen(id, PDF, 'Angebot Aggregat.pdf', {}, angebotId);
    expect(antwort.status).toBe(201);
    expect(antwort.json?.['angebote']).toEqual([
      expect.objectContaining({
        dateiname: 'Angebot Aggregat.pdf',
        quelle: 'upload',
        groesse: PDF.length,
      }),
    ]);

    const datei = await rufe(MAX, 'GET', `/api/vorgaenge/${id}/angebote/${angebotId}`);
    expect(datei.status).toBe(200);
    expect([...(datei.bytes as Uint8Array)]).toEqual([...PDF]);

    const weg = await rufe(MAX, 'DELETE', `/api/vorgaenge/${id}/angebote/${angebotId}`);
    expect(weg.json?.['angebote']).toEqual([]);
    expect(r2.objekte.size).toBe(0);
  });

  it('nimmt nur PDF, PNG und JPEG mit passender Endung an', async () => {
    const id = await vorgang();
    expect((await hochladen(id, new Uint8Array([1, 2, 3, 4, 5, 6]))).diagnose).toBe(
      'VORGANG_ANGEBOT_TYP_UNGUELTIG',
    );
    expect((await hochladen(id, PDF, 'angebot.png')).diagnose).toBe(
      'VORGANG_ANGEBOT_TYP_UNGUELTIG',
    );
    expect((await hochladen(id, PDF, '../x.pdf')).status).toBe(400);
    expect(
      (
        await rufe(ZORA, 'PUT', `/api/vorgaenge/${id}/angebote/${crypto.randomUUID()}`, {
          bytes: PDF,
          kopf: { 'X-Stationwizard-Dateiname': 'a.pdf' },
        })
      ).status,
    ).toBe(400);
  });

  it('begrenzt Anzahl und Größe und sperrt nach dem Einreichen', async () => {
    const id = await vorgang();
    for (let i = 0; i < 10; i++) expect((await hochladen(id, PDF)).status).toBe(201);
    expect((await hochladen(id, PDF)).diagnose).toBe('VORGANG_ANGEBOTE_GRENZE');

    const zweiter = await vorgang();
    const gross = new Uint8Array(10 * 1024 * 1024 + 1);
    gross.set(PDF);
    expect((await hochladen(zweiter, gross)).status).toBe(413);

    fahrzeuge.db.prepare('UPDATE vorgaenge SET stufe = 2 WHERE id = ?').run(zweiter);
    expect((await hochladen(zweiter, PDF)).diagnose).toBe('VORGANG_ANGEBOT_GESPERRT');
  });

  it('sperrt ohne Dateispeicher mit festem Code', async () => {
    const id = await vorgang();
    const antwort = await rufe(
      ZORA,
      'PUT',
      `/api/vorgaenge/${id}/angebote/${crypto.randomUUID()}`,
      { bytes: PDF, kopf: { 'If-None-Match': '*', 'X-Stationwizard-Dateiname': 'a.pdf' } },
      umgebung({ VORGAENGE_DATEIEN: undefined }),
    );
    expect(antwort.status).toBe(503);
  });

  it('übernimmt die Notiz zur Mail und ordnet die Mail danach zu (Rohmail wird gelöscht)', async () => {
    await adressen();
    await verarbeiteEingehendeMail(mail({ an: 'gw-san@x.test', betreff: 'Angebot' }), umgebung());
    const mailId = (fahrzeuge.db.prepare('SELECT id FROM postfach_mails').get() as { id: string })
      .id;
    const id = await vorgang();
    const notiz = btoa(
      String.fromCharCode(
        ...new TextEncoder().encode(
          JSON.stringify({
            betreff: 'Angebot',
            absender: 'werkstatt@example.test',
            datum: '2026-11-23',
            text: 'Preis 500 €',
          }),
        ),
      ),
    );
    const hochgeladen = await hochladen(id, PDF, 'a.pdf', { 'X-Stationwizard-Notiz': notiz });
    expect(hochgeladen.json?.['angebote'][0]).toMatchObject({
      quelle: 'email',
      mailAbsender: 'werkstatt@example.test',
      mailText: 'Preis 500 €',
    });

    const zugeordnet = await rufe(TIM, 'POST', `/api/postfach/mails/${mailId}/zuordnung`, {
      koerper: { vorgangId: id },
    });
    expect(zugeordnet.status).toBe(200);
    expect(
      fahrzeuge.db
        .prepare('SELECT status, vorgang_id, r2_schluessel, betreff FROM postfach_mails')
        .get(),
    ).toMatchObject({ status: 'zugeordnet', vorgang_id: id, r2_schluessel: null, betreff: '' });
    expect(r2.objekte.size).toBe(1); // nur noch das Angebot
    expect(
      (
        await rufe(TIM, 'POST', `/api/postfach/mails/${mailId}/zuordnung`, {
          koerper: { vorgangId: id },
        })
      ).status,
    ).toBe(404);
  });

  it('lehnt eine ungültige Notiz ab', async () => {
    const id = await vorgang();
    expect(
      (await hochladen(id, PDF, 'a.pdf', { 'X-Stationwizard-Notiz': btoa('{"x":1}') })).status,
    ).toBe(400);
  });

  it('meldet ungeordnete Mails in den Aufgaben nur Berechtigten', async () => {
    await adressen();
    await verarbeiteEingehendeMail(mail({ an: 'gw-san@x.test' }), umgebung());
    expect((await rufe(TIM, 'GET', '/api/vorgaenge/aufgaben')).json?.['postfachOffen']).toBe(1);
    expect((await rufe(MAX, 'GET', '/api/vorgaenge/aufgaben')).json?.['postfachOffen']).toBe(0);
  });
});
