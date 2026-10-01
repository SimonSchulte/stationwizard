import { describe, expect, it } from 'vitest';
import { verarbeiteKalender } from '../src/kalender-planung';
import { FakeKalenderDb } from './kalender-planung-db-fake';

const IDENTITAET = { email: 'geprueft@example.test' };

function termin(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: 'termin-1',
    datum: '2026-03-02',
    datumBis: null,
    beginnZeit: '19:00',
    endeZeit: '21:30',
    typ: 'dienst',
    hinweis: '',
    kategorie: 'SAN',
    thema: 'Erfundenes Übungsthema',
    ausbilder: 'Testperson',
    katsThemaId: 'kats-1',
    katsTitel: 'Erfundener KatS-Titel',
    katsPflicht: true,
    hgmInhalt: '',
    hgmTitel: '',
    nachweise: ['aed', 'bls'],
    material: '',
    anforderungen: '',
    notizen: '',
    ...ueberschreibung,
  };
}

function idee(ueberschreibung: Record<string, unknown> = {}) {
  return termin({ id: 'idee-1', datum: null, datumBis: null, ...ueberschreibung });
}

function jahr(ueberschreibung: Record<string, unknown> = {}) {
  return {
    jahr: 2026,
    titel: 'Jahresplan 2026',
    termine: [termin()],
    katsThemen: [
      { id: 'kats-1', nummer: '1.1', titel: 'Erfundenes Thema', beschreibung: '', pflicht: true },
    ],
    ...ueberschreibung,
  };
}

function verarbeiten(db: FakeKalenderDb, pfad: string, init?: RequestInit) {
  return verarbeiteKalender(
    new Request(`https://stationwizard.example.test${pfad}`, init),
    { KALENDER_DB: db as never },
    IDENTITAET,
  );
}

function json(methode: string, koerper: unknown, header: Record<string, string> = {}) {
  return {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...header },
    body: JSON.stringify(koerper),
  };
}

async function legeJahrAn(db: FakeKalenderDb, koerper: unknown = jahr()) {
  return verarbeiten(db, '/api/kalender/jahre', json('POST', koerper, { 'If-None-Match': '*' }));
}

describe('verarbeiteKalender – ohne Konfiguration', () => {
  it('sperrt ohne D1-Binding mit 503 statt abzustürzen', async () => {
    const antwort = await verarbeiteKalender(
      new Request('https://stationwizard.example.test/api/kalender'),
      {},
      IDENTITAET,
    );
    expect(antwort.status).toBe(503);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('KALENDER_KONFIGURATION_FEHLT');
  });
});

describe('Kalender lesen', () => {
  it('liefert einen leeren Kalender mit ideen = null', async () => {
    const antwort = await verarbeiten(new FakeKalenderDb(), '/api/kalender');
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ jahre: [], ideen: null });
  });

  it('liefert alle Jahre sortiert samt Version in einem Aufruf', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db, jahr({ jahr: 2027, titel: 'Jahresplan 2027', termine: [] }));
    await legeJahrAn(db);
    const koerper = (await (await verarbeiten(db, '/api/kalender')).json()) as {
      jahre: { jahr: number; version: number; termine: unknown[]; geaendertVon: string }[];
    };
    expect(koerper.jahre.map((j) => j.jahr)).toEqual([2026, 2027]);
    expect(koerper.jahre[0].version).toBe(1);
    expect(koerper.jahre[0].termine).toEqual([termin()]);
    expect(koerper.jahre[0].geaendertVon).toBe(IDENTITAET.email);
  });

  it('lehnt Query-Parameter und unbekannte Pfade mit 404 ab', async () => {
    const db = new FakeKalenderDb();
    expect((await verarbeiten(db, '/api/kalender?jahr=2026')).status).toBe(404);
    expect((await verarbeiten(db, '/api/kalender/unbekannt')).status).toBe(404);
    expect((await verarbeiten(db, '/api/kalender/jahre/26')).status).toBe(404);
  });

  it('erlaubt kein Löschen', async () => {
    const antwort = await verarbeiten(new FakeKalenderDb(), '/api/kalender/jahre/2026', {
      method: 'DELETE',
    });
    expect(antwort.status).toBe(405);
  });
});

describe('Jahr anlegen und speichern', () => {
  it('legt ein Jahr nur mit If-None-Match: * an', async () => {
    const db = new FakeKalenderDb();
    const ohne = await verarbeiten(db, '/api/kalender/jahre', json('POST', jahr()));
    expect(ohne.status).toBe(428);
    const mit = await legeJahrAn(db);
    expect(mit.status).toBe(201);
    expect(mit.headers.get('ETag')).toBe('"1"');
  });

  it('meldet ein bereits vorhandenes Jahr als Konflikt', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db);
    expect((await legeJahrAn(db)).status).toBe(412);
  });

  it('speichert mit passender Version und zählt hoch', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db);
    const antwort = await verarbeiten(
      db,
      '/api/kalender/jahre/2026',
      json('PUT', jahr({ titel: 'Neu' }), { 'If-Match': '"1"' }),
    );
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('ETag')).toBe('"2"');
    expect(db.jahre.get(2026)?.titel).toBe('Neu');
  });

  it('nimmt ein von Cloudflare abgeschwächtes ETag an', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db);
    const antwort = await verarbeiten(
      db,
      '/api/kalender/jahre/2026',
      json('PUT', jahr(), { 'If-Match': 'W/"1"' }),
    );
    expect(antwort.status).toBe(200);
  });

  it('lehnt einen veralteten Stand mit 412 ab und schreibt nichts', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db);
    await verarbeiten(db, '/api/kalender/jahre/2026', json('PUT', jahr(), { 'If-Match': '"1"' }));
    const vorher = db.jahre.get(2026);
    const antwort = await verarbeiten(
      db,
      '/api/kalender/jahre/2026',
      json('PUT', jahr({ titel: 'Überholt' }), { 'If-Match': '"1"' }),
    );
    expect(antwort.status).toBe(412);
    expect(db.jahre.get(2026)).toEqual(vorher);
  });

  it('verlangt If-Match (428), eine lesbare Version (400) und keine Kombination', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db);
    const pfad = '/api/kalender/jahre/2026';
    expect((await verarbeiten(db, pfad, json('PUT', jahr()))).status).toBe(428);
    expect((await verarbeiten(db, pfad, json('PUT', jahr(), { 'If-Match': '*' }))).status).toBe(
      400,
    );
    const kombiniert = await verarbeiten(
      db,
      pfad,
      json('PUT', jahr(), { 'If-Match': '"1"', 'If-None-Match': '*' }),
    );
    expect(kombiniert.status).toBe(400);
  });

  it('lehnt ein abweichendes Jahr im Körper ab', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db);
    const antwort = await verarbeiten(
      db,
      '/api/kalender/jahre/2026',
      json('PUT', jahr({ jahr: 2027 }), { 'If-Match': '"1"' }),
    );
    expect(antwort.status).toBe(400);
  });

  it('verlangt JSON als Inhaltstyp', async () => {
    const antwort = await verarbeiten(new FakeKalenderDb(), '/api/kalender/jahre', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'If-None-Match': '*' },
      body: JSON.stringify(jahr()),
    });
    expect(antwort.status).toBe(415);
  });
});

describe('Prüfung der Termine', () => {
  const faelle: [string, Record<string, unknown>][] = [
    ['unbekannte Kategorie', { kategorie: 'Erfunden' }],
    ['unbekannter Typ', { typ: 'feier' }],
    ['unbekannter Nachweis', { nachweise: ['erfunden'] }],
    ['doppelter Nachweis', { nachweise: ['aed', 'aed'] }],
    ['ungültiges Datum', { datum: '2026-02-30' }],
    ['Enddatum vor Beginn', { datumBis: '2026-03-01' }],
    ['Enddatum gleich Beginn', { datumBis: '2026-03-02' }],
    ['ungültige Uhrzeit', { beginnZeit: '25:00' }],
    ['fehlendes Datum im Jahresblatt', { datum: null }],
    ['Text statt Wahrheitswert', { katsPflicht: 'ja' }],
    ['fehlendes Textfeld', { notizen: undefined }],
  ];
  for (const [name, ueberschreibung] of faelle) {
    it(`lehnt ${name} ab`, async () => {
      const antwort = await legeJahrAn(
        new FakeKalenderDb(),
        jahr({ termine: [termin(ueberschreibung)] }),
      );
      expect(antwort.status).toBe(400);
    });
  }

  it('lehnt doppelte Termin-Ids ab', async () => {
    const antwort = await legeJahrAn(new FakeKalenderDb(), jahr({ termine: [termin(), termin()] }));
    expect(antwort.status).toBe(400);
  });

  it('übernimmt keine unbekannten Felder', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db, jahr({ termine: [{ ...termin(), fremd: 'x' }] }));
    expect(db.jahre.get(2026)?.termine).not.toContain('fremd');
  });

  it('nimmt mehrtägige Termine und leere Uhrzeiten an', async () => {
    const antwort = await legeJahrAn(
      new FakeKalenderDb(),
      jahr({ termine: [termin({ datumBis: '2026-03-04', beginnZeit: '', endeZeit: '' })] }),
    );
    expect(antwort.status).toBe(201);
  });
});

describe('Offene Ideen', () => {
  it('legt die Ideen beim ersten Speichern mit If-None-Match: * an und aktualisiert dann', async () => {
    const db = new FakeKalenderDb();
    const neu = await verarbeiten(
      db,
      '/api/kalender/ideen',
      json('PUT', { termine: [idee()] }, { 'If-None-Match': '*' }),
    );
    expect(neu.status).toBe(201);
    expect(neu.headers.get('ETag')).toBe('"1"');
    const weiter = await verarbeiten(
      db,
      '/api/kalender/ideen',
      json('PUT', { termine: [] }, { 'If-Match': '"1"' }),
    );
    expect(weiter.status).toBe(200);
    expect(weiter.headers.get('ETag')).toBe('"2"');
  });

  it('meldet eine zweite Neuanlage und einen veralteten Stand als Konflikt', async () => {
    const db = new FakeKalenderDb();
    const neu = json('PUT', { termine: [] }, { 'If-None-Match': '*' });
    await verarbeiten(db, '/api/kalender/ideen', neu);
    expect((await verarbeiten(db, '/api/kalender/ideen', neu)).status).toBe(412);
    const veraltet = await verarbeiten(
      db,
      '/api/kalender/ideen',
      json('PUT', { termine: [] }, { 'If-Match': '"7"' }),
    );
    expect(veraltet.status).toBe(412);
  });

  it('lehnt eine Idee mit Datum ab', async () => {
    const antwort = await verarbeiten(
      new FakeKalenderDb(),
      '/api/kalender/ideen',
      json('PUT', { termine: [termin()] }, { 'If-None-Match': '*' }),
    );
    expect(antwort.status).toBe(400);
  });
});

describe('Einmalige Migration', () => {
  function migration(koerper: unknown = { jahre: [jahr()], ideen: [idee()] }) {
    return json('POST', koerper, { 'If-None-Match': '*' });
  }

  it('übernimmt alle Jahre und Ideen auf einmal', async () => {
    const db = new FakeKalenderDb();
    const antwort = await verarbeiten(
      db,
      '/api/kalender/migration',
      migration({
        jahre: [jahr(), jahr({ jahr: 2025, titel: 'Jahresplan 2025', termine: [] })],
        ideen: [idee()],
      }),
    );
    expect(antwort.status).toBe(201);
    expect([...db.jahre.keys()].sort()).toEqual([2025, 2026]);
    expect(db.ideen.size).toBe(1);
    const koerper = (await antwort.json()) as { jahre: { version: number }[] };
    expect(koerper.jahre.every((j) => j.version === 1)).toBe(true);
  });

  it('ist nur einmal möglich und überschreibt keinen gepflegten Stand', async () => {
    const db = new FakeKalenderDb();
    await verarbeiten(db, '/api/kalender/migration', migration());
    const vorher = db.jahre.get(2026);
    const zweite = await verarbeiten(
      db,
      '/api/kalender/migration',
      migration({ jahre: [jahr({ titel: 'Überschrieben' })], ideen: [] }),
    );
    expect(zweite.status).toBe(409);
    expect(zweite.headers.get('X-Stationwizard-Diagnose')).toBe('KALENDER_BEREITS_BEFUELLT');
    expect(db.jahre.get(2026)).toEqual(vorher);
  });

  it('gilt auch dann als befüllt, wenn nur ein Jahr angelegt wurde', async () => {
    const db = new FakeKalenderDb();
    await legeJahrAn(db, jahr({ jahr: 2030, titel: 'Jahresplan 2030', termine: [] }));
    const antwort = await verarbeiten(db, '/api/kalender/migration', migration());
    expect(antwort.status).toBe(409);
    expect(db.jahre.has(2026)).toBe(false);
  });

  it('schreibt bei einem ungültigen Jahr gar nichts', async () => {
    const db = new FakeKalenderDb();
    const antwort = await verarbeiten(
      db,
      '/api/kalender/migration',
      migration({
        jahre: [jahr(), jahr({ jahr: 2025, termine: [termin({ typ: 'x' })] })],
        ideen: [],
      }),
    );
    expect(antwort.status).toBe(400);
    expect(db.schreibvorgaenge).toBe(0);
  });

  it('lehnt doppelte Jahre ab', async () => {
    const antwort = await verarbeiten(
      new FakeKalenderDb(),
      '/api/kalender/migration',
      migration({ jahre: [jahr(), jahr()], ideen: [] }),
    );
    expect(antwort.status).toBe(400);
  });

  it('verlangt If-None-Match: *', async () => {
    const antwort = await verarbeiten(
      new FakeKalenderDb(),
      '/api/kalender/migration',
      json('POST', { jahre: [], ideen: [] }),
    );
    expect(antwort.status).toBe(428);
  });

  it('verwirft einen abgebrochenen Stapel vollständig', async () => {
    const db = new FakeKalenderDb();
    // Ein Rennen: die Ideen-Zeile entsteht zwischen Prüfung und Stapel.
    const ursprung = db.batch.bind(db);
    db.batch = async (anweisungen) => {
      db.ideen.set('offene-ideen', {
        id: 'offene-ideen',
        termine: '[]',
        geaendert_am: '',
        geaendert_von: '',
        version: 1,
      });
      return ursprung(anweisungen);
    };
    const antwort = await verarbeiten(db, '/api/kalender/migration', migration());
    expect(antwort.status).toBe(409);
    expect(db.jahre.size).toBe(0);
  });
});
