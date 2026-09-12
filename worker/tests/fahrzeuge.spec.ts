import { describe, expect, it } from 'vitest';
import { kurzlinkWeiterleitung, verarbeiteFahrzeuge } from '../src/fahrzeuge';
import { FakeFahrzeugeDb } from './fahrzeug-db-fake';

const ID = '01234567-89ab-4cde-8fab-0123456789ab';
const IDENTITAET = { email: 'geprueft@example.test' };
const FREMDE_IDENTITAET = { email: 'jemand-anders@example.test' };

function anfrage(pfad: string, init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

function fahrzeugKoerper(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: ID,
    bezeichnung: 'MTW Übung 1',
    funkrufname: 'Florian Testort 1/85/1',
    kennzeichen: 'XY-TE 123',
    fahrgestellnummer: null,
    eigentuemer: 'organisation',
    bemerkung: '',
    wartungstermine: [],
    ...ueberschreibung,
  };
}

async function legeAn(db: FakeFahrzeugeDb, koerper = fahrzeugKoerper()) {
  return verarbeiteFahrzeuge(
    anfrage('/api/fahrzeuge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
      body: JSON.stringify(koerper),
    }),
    { FAHRZEUGE_DB: db as never },
    IDENTITAET,
  );
}

describe('verarbeiteFahrzeuge – ohne Konfiguration', () => {
  it('sperrt ohne D1-Binding statt mit einem Absturz', async () => {
    const antwort = await verarbeiteFahrzeuge(anfrage('/api/fahrzeuge'), {}, IDENTITAET);
    expect(antwort.status).toBe(503);
  });
});

describe('POST /api/fahrzeuge', () => {
  it('legt mit If-None-Match: * ein neues Fahrzeug an und setzt die Identität serverseitig', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await legeAn(
      db,
      fahrzeugKoerper({ geaendertVon: 'vorgetaeuscht@example.test' }),
    );
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
    const koerper = (await antwort.json()) as { geaendertVon: string };
    expect(koerper.geaendertVon).toBe(IDENTITAET.email);
  });

  it('lehnt die Anlage ohne If-None-Match ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage('/api/fahrzeuge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fahrzeugKoerper()),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(428);
  });

  it('lehnt eine zweite Anlage mit derselben id als Konflikt ab', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await legeAn(db);
    expect(antwort.status).toBe(412);
  });

  it('lehnt eine ungültige Fahrgestellnummer ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await legeAn(db, fahrzeugKoerper({ fahrgestellnummer: 'zu-kurz' }));
    expect(antwort.status).toBe(400);
  });

  it('lehnt einen unbekannten Eigentümer ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await legeAn(db, fahrzeugKoerper({ eigentuemer: 'unbekannt' }));
    expect(antwort.status).toBe(400);
  });
});

describe('GET /api/fahrzeuge und /api/fahrzeuge/<id>', () => {
  it('listet angelegte Fahrzeuge', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage('/api/fahrzeuge'),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    const koerper = (await antwort.json()) as { fahrzeuge: unknown[] };
    expect(koerper.fahrzeuge).toHaveLength(1);
  });

  it('liefert 404 für ein unbekanntes Fahrzeug', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });

  it('liefert das Fahrzeug mit ETag, wenn vorhanden', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('ETag')).toBe('"1"');
  });
});

describe('PUT /api/fahrzeuge/<id>', () => {
  it('aktualisiert mit passendem If-Match und erhöht die Version', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify(fahrzeugKoerper({ bemerkung: 'aktualisiert' })),
      }),
      { FAHRZEUGE_DB: db as never },
      FREMDE_IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('ETag')).toBe('"2"');
    const koerper = (await antwort.json()) as { geaendertVon: string; bemerkung: string };
    expect(koerper.geaendertVon).toBe(FREMDE_IDENTITAET.email);
    expect(koerper.bemerkung).toBe('aktualisiert');
  });

  it('lehnt ein Update mit veralteter Version als Konflikt ab (412)', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify(fahrzeugKoerper()),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify(fahrzeugKoerper({ bemerkung: 'zu spät' })),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(412);
  });

  it('lehnt ein Update ohne If-Match ab', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fahrzeugKoerper()),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(428);
  });
});

describe('Ablesungen', () => {
  it('hängt eine Ablesung an und setzt erfasstVon/erfasstAm serverseitig, auch bei vorgetäuschten Werten', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fahrzeugId: ID,
          abgelesenAm: '2026-06-01',
          stand: 1000,
          erfasstVon: 'vorgetaeuscht@example.test',
          quelle: 'qr',
          korrigiert: null,
          bemerkung: '',
        }),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(201);
    const koerper = (await antwort.json()) as { erfasstVon: string; erfasstAm: string };
    expect(koerper.erfasstVon).toBe(IDENTITAET.email);
    expect(koerper.erfasstAm).toBeTruthy();
  });

  it('lehnt eine Ablesung für ein unbekanntes Fahrzeug ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abgelesenAm: '2026-06-01',
          stand: 1000,
          quelle: 'formular',
          korrigiert: null,
          bemerkung: '',
        }),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });

  it('lehnt eine negative Kilometerangabe ab', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abgelesenAm: '2026-06-01',
          stand: -5,
          quelle: 'formular',
          korrigiert: null,
          bemerkung: '',
        }),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(400);
  });

  it('lehnt einen Verweis auf eine nicht existierende Korrektur ab', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abgelesenAm: '2026-06-01',
          stand: 1000,
          quelle: 'korrektur',
          korrigiert: 'nicht-vorhanden',
          bemerkung: '',
        }),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(400);
  });

  it('listet Ablesungen sortiert nach Datum', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    for (const [abgelesenAm, stand] of [
      ['2026-03-01', 100],
      ['2026-01-01', 10],
    ] as const) {
      await verarbeiteFahrzeuge(
        anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            abgelesenAm,
            stand,
            quelle: 'formular',
            korrigiert: null,
            bemerkung: '',
          }),
        }),
        { FAHRZEUGE_DB: db as never },
        IDENTITAET,
      );
    }
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    const koerper = (await antwort.json()) as { ablesungen: { abgelesenAm: string }[] };
    expect(koerper.ablesungen.map((a) => a.abgelesenAm)).toEqual(['2026-01-01', '2026-03-01']);
  });
});

describe('Methoden und unbekannte Pfade', () => {
  it('lehnt eine unbekannte Methode auf der Liste ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage('/api/fahrzeuge', { method: 'DELETE' }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(405);
  });

  it('lehnt einen Query-String ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage('/api/fahrzeuge?x=1'),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });

  it('liefert 404 für einen unbekannten Fahrzeuge-Pfad', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage('/api/fahrzeuge/nicht-uuid'),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });
});

describe('kurzlinkWeiterleitung', () => {
  it('leitet die Übersicht auf die Hash-Route weiter', () => {
    const antwort = kurzlinkWeiterleitung(`/f/${ID}`);
    expect(antwort?.status).toBe(302);
    expect(antwort?.headers.get('Location')).toBe(`/#/fahrzeuge/${ID}`);
  });

  it('leitet die Kilometererfassung auf die Hash-Route weiter', () => {
    const antwort = kurzlinkWeiterleitung(`/f/${ID}/km`);
    expect(antwort?.status).toBe(302);
    expect(antwort?.headers.get('Location')).toBe(`/#/fahrzeuge/${ID}/km`);
  });

  it('gibt null für einen unbekannten Kurzlink zurück', () => {
    expect(kurzlinkWeiterleitung('/f/nicht-uuid')).toBeNull();
  });
});
