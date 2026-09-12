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

describe('DELETE /api/fahrzeuge/<id>/ablesungen/<id>', () => {
  async function ergaenze(db: FakeFahrzeugeDb, koerper: Record<string, unknown>) {
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    return (await antwort.json()) as { id: string };
  }

  it('löscht eine Ablesung ohne Korrektur', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const { id } = await ergaenze(db, {
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen/${id}`, { method: 'DELETE' }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(204);
    expect(db.ablesungen).toHaveLength(0);
  });

  it('liefert 404 für eine unbekannte Ablesung', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen/${ID}`, { method: 'DELETE' }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });

  it('lehnt das Löschen einer bereits korrigierten Ablesung ab (409)', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const original = await ergaenze(db, {
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: '',
    });
    await ergaenze(db, {
      abgelesenAm: '2026-06-01',
      stand: 1050,
      quelle: 'korrektur',
      korrigiert: original.id,
      bemerkung: '',
    });
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen/${original.id}`, { method: 'DELETE' }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(409);
    expect(db.ablesungen).toHaveLength(2);
  });

  it('lehnt eine unbekannte Methode auf dem Einzelpfad ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen/${ID}`, { method: 'GET' }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(405);
  });
});

describe('Änderungsprotokoll', () => {
  async function aenderungen(db: FakeFahrzeugeDb, fahrzeugId = ID) {
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${fahrzeugId}/aenderungen`),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    return antwort;
  }

  it('protokolliert die Anlage eines Fahrzeugs', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await aenderungen(db);
    expect(antwort.status).toBe(200);
    const koerper = (await antwort.json()) as {
      aenderungen: { von: string; beschreibung: string }[];
    };
    expect(koerper.aenderungen).toHaveLength(1);
    expect(koerper.aenderungen[0].beschreibung).toBe('Fahrzeug angelegt');
    expect(koerper.aenderungen[0].von).toBe(IDENTITAET.email);
  });

  it('liefert 404 für ein unbekanntes Fahrzeug', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await aenderungen(db);
    expect(antwort.status).toBe(404);
  });

  it('lehnt eine unbekannte Methode ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/aenderungen`, { method: 'POST' }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(405);
  });

  it('protokolliert geänderte Stammdaten mit alten und neuen Werten', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify(fahrzeugKoerper({ bezeichnung: 'MTW Übung 2', eigentuemer: 'bund' })),
      }),
      { FAHRZEUGE_DB: db as never },
      FREMDE_IDENTITAET,
    );
    const antwort = await aenderungen(db);
    const koerper = (await antwort.json()) as {
      aenderungen: { von: string; beschreibung: string }[];
    };
    expect(koerper.aenderungen).toHaveLength(2);
    const stammdatenEintrag = koerper.aenderungen.find((a) => a.von === FREMDE_IDENTITAET.email);
    expect(stammdatenEintrag?.beschreibung).toContain(
      'Bezeichnung geändert: MTW Übung 1 → MTW Übung 2',
    );
    expect(stammdatenEintrag?.beschreibung).toContain('Eigentümer geändert: Organisation → Bund');
  });

  it('protokolliert keinen zusätzlichen Eintrag, wenn sich nichts geändert hat', async () => {
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
    const antwort = await aenderungen(db);
    const koerper = (await antwort.json()) as { aenderungen: unknown[] };
    expect(koerper.aenderungen).toHaveLength(1);
  });

  it('protokolliert hinzugefügte, geänderte und entfernte Wartungstermine', async () => {
    const db = new FakeFahrzeugeDb();
    const bleibt = {
      id: 'w-bleibt',
      art: 'frei',
      bezeichnung: 'Gerätecheck',
      faelligAm: '2026-01-01',
      erinnerungTage: 30,
      erledigtAm: null,
    };
    const entfernt = {
      id: 'w-entfernt',
      art: 'frei',
      bezeichnung: 'Reifenwechsel',
      faelligAm: '2026-02-01',
      erinnerungTage: 14,
      erledigtAm: null,
    };
    await legeAn(db, fahrzeugKoerper({ wartungstermine: [bleibt, entfernt] }));
    await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify(
          fahrzeugKoerper({
            wartungstermine: [
              { ...bleibt, erledigtAm: '2026-01-05' },
              {
                id: 'w-neu',
                art: 'hu',
                bezeichnung: 'Hauptuntersuchung',
                faelligAm: '2026-03-01',
                erinnerungTage: 30,
                erledigtAm: null,
              },
            ],
          }),
        ),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    const antwort = await aenderungen(db);
    const koerper = (await antwort.json()) as { aenderungen: { beschreibung: string }[] };
    const beschreibung = koerper.aenderungen.map((a) => a.beschreibung).join('\n');
    expect(beschreibung).toContain('Wartungstermin „Hauptuntersuchung" hinzugefügt');
    expect(beschreibung).toContain('Wartungstermin „Reifenwechsel" entfernt');
    expect(beschreibung).toContain('Wartungstermin „Gerätecheck": als erledigt markiert');
  });

  it('protokolliert eine erfasste und eine gelöschte Ablesung', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const erfassung = await verarbeiteFahrzeuge(
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
    const { id: ablesungId } = (await erfassung.json()) as { id: string };
    await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen/${ablesungId}`, { method: 'DELETE' }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    const antwort = await aenderungen(db);
    const koerper = (await antwort.json()) as { aenderungen: { beschreibung: string }[] };
    const beschreibungen = koerper.aenderungen.map((a) => a.beschreibung);
    expect(beschreibungen).toContain('Kilometerstand erfasst: 1000 km am 2026-06-01');
    expect(beschreibungen).toContain('Kilometerstand gelöscht: 1000 km vom 2026-06-01');
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
    expect(antwort?.headers.get('Location')).toBe(`/#/fahrzeuge/${ID}/km?quelle=qr`);
  });

  it('gibt null für einen unbekannten Kurzlink zurück', () => {
    expect(kurzlinkWeiterleitung('/f/nicht-uuid')).toBeNull();
  });
});
