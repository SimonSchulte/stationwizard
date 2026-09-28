import { describe, expect, it } from 'vitest';
import { kurzlinkWeiterleitung, verarbeiteFahrzeuge } from '../src/fahrzeuge';
import { FakeBenutzerDb } from './benutzer-db-fake';
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
    gruppe: 'fuehrung',
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

  it('lehnt eine unbekannte Gruppe ab', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await legeAn(db, fahrzeugKoerper({ gruppe: 'verpflegung' }));
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

  // Cloudflare schwächt einen starken ETag zu `W/"1"` ab, sobald es die Antwort
  // unterwegs komprimiert; der Browser schickt genau das zurück (siehe
  // worker/src/etag.ts). Ohne diesen Fall scheiterte jedes Speichern in
  // Produktion, ohne dass lokal etwas auffiel.
  it('nimmt einen abgeschwächten ETag als If-Match an', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': 'W/"1"' },
        body: JSON.stringify(fahrzeugKoerper({ bemerkung: 'aktualisiert' })),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('ETag')).toBe('"2"');
  });

  it('erkennt einen Konflikt auch bei abgeschwächtem ETag', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': 'W/"99"' },
        body: JSON.stringify(fahrzeugKoerper()),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(412);
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

  it('antwortet auf das Anhängen mit derselben Form wie die Liste, einschließlich gemeldetVonName', async () => {
    // Die Clientprüfung verlangt jedes Feld; fehlte eines nur in der
    // POST-Antwort, galt eine gespeicherte Ablesung als ungültig geliefert.
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const angelegt = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fahrzeugId: ID,
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
    expect(angelegt.status).toBe(201);
    const koerper = (await angelegt.json()) as Record<string, unknown>;
    expect(koerper['gemeldetVonName']).toBe('');

    const liste = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    const { ablesungen } = (await liste.json()) as { ablesungen: unknown[] };
    expect(ablesungen).toEqual([koerper]);
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

describe('Kennzeichen ist eindeutig', () => {
  const ZWEITE_ID = 'abcdef01-2345-4678-89ab-cdef01234567';

  it('weist ein bereits vergebenes Kennzeichen mit 409 ab', async () => {
    const db = new FakeFahrzeugeDb();
    expect((await legeAn(db)).status).toBe(201);
    const antwort = await legeAn(
      db,
      fahrzeugKoerper({ id: ZWEITE_ID, bezeichnung: 'Zweites Fahrzeug' }),
    );
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('FAHRZEUG_KENNZEICHEN_VERGEBEN');
    expect(db.fahrzeuge.size).toBe(1);
  });

  it('erkennt Schreibvarianten desselben Kennzeichens', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db, fahrzeugKoerper({ kennzeichen: 'XY-TE 123' }));
    for (const variante of [
      'xy te123',
      'XYTE123',
      'xy-te-123',
      'X.Y-TE.123'.replace('X.Y', 'XY'),
    ]) {
      const antwort = await legeAn(db, fahrzeugKoerper({ id: ZWEITE_ID, kennzeichen: variante }));
      expect(antwort.status, `Variante ${variante}`).toBe(409);
    }
    expect(db.fahrzeuge.size).toBe(1);
  });

  it('lässt leere Kennzeichen mehrfach zu, weil das Datenmodell sie erlaubt', async () => {
    const db = new FakeFahrzeugeDb();
    expect((await legeAn(db, fahrzeugKoerper({ kennzeichen: '' }))).status).toBe(201);
    const antwort = await legeAn(db, fahrzeugKoerper({ id: ZWEITE_ID, kennzeichen: '' }));
    expect(antwort.status).toBe(201);
    expect(db.fahrzeuge.size).toBe(2);
  });

  it('unterscheidet die Kennzeichenkollision vom Konflikt gleicher Kennung', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const gleicheId = await legeAn(db, fahrzeugKoerper({ kennzeichen: 'XY-TE 999' }));
    expect(gleicheId.status).toBe(412);
    expect(gleicheId.headers.get('X-Stationwizard-Diagnose')).toBe('FAHRZEUGE_KONFLIKT');
  });

  it('weist auch beim Ändern ein fremdes Kennzeichen ab und lässt den Stand unverändert', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    await legeAn(db, fahrzeugKoerper({ id: ZWEITE_ID, kennzeichen: 'XY-TE 456' }));
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ZWEITE_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify(fahrzeugKoerper({ id: ZWEITE_ID, kennzeichen: 'xy te 123' })),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('FAHRZEUG_KENNZEICHEN_VERGEBEN');
    expect(db.fahrzeuge.get(ZWEITE_ID)?.kennzeichen).toBe('XY-TE 456');
    expect(db.fahrzeuge.get(ZWEITE_ID)?.version).toBe(1);
  });

  it('lässt das eigene Kennzeichen beim Ändern unangetastet durch', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
        body: JSON.stringify(fahrzeugKoerper({ bezeichnung: 'MTW Übung 2' })),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(db.fahrzeuge.get(ID)?.bezeichnung).toBe('MTW Übung 2');
  });
});

describe('Kennzeichen: Rennen zwischen Vorabprüfung und Schreiben', () => {
  /** Meldet das Kennzeichen als frei, lässt den Index beim Schreiben aber zuschlagen. */
  class NachtraeglichBelegteDb extends FakeFahrzeugeDb {
    override vorabTreffer(): string | null {
      return null;
    }
  }

  it('beantwortet die Indexverletzung beim Anlegen als Kennzeichenkollision, nicht als 412', async () => {
    const db = new NachtraeglichBelegteDb();
    expect((await legeAn(db)).status).toBe(201);
    const antwort = await legeAn(
      db,
      fahrzeugKoerper({ id: 'abcdef01-2345-4678-89ab-cdef01234567' }),
    );
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('FAHRZEUG_KENNZEICHEN_VERGEBEN');
  });
});

describe('Erfassungstoken für die öffentliche Kilometermeldung', () => {
  function benutzerDb(rolle: string | null) {
    const db = new FakeBenutzerDb();
    db.benutzer.set(IDENTITAET.email, {
      email: IDENTITAET.email,
      rolle,
      sonderrollen: '[]',
      erster_zugriff_am: '2026-01-01T00:00:00.000Z',
      letzter_zugriff_am: '2026-01-01T00:00:00.000Z',
      rolle_geaendert_am: null,
      rolle_geaendert_von: null,
    });
    return db;
  }

  it('vergibt bei der Anlage sofort ein Token', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    expect(db.fahrzeuge.get(ID)?.erfassung_token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('gibt das Token in keiner Fahrzeugantwort preis', async () => {
    // Das Token ist ein Geheimnis. Stünde es in der Fahrzeugliste, reichte es
    // über die Fahrzeugquelle bis in den Einsatzplaner.
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const token = db.fahrzeuge.get(ID)!.erfassung_token!;

    for (const pfad of ['/api/fahrzeuge', `/api/fahrzeuge/${ID}`]) {
      const antwort = await verarbeiteFahrzeuge(
        anfrage(pfad),
        { FAHRZEUGE_DB: db as never },
        IDENTITAET,
      );
      const roh = await antwort.text();
      expect(roh).not.toContain(token);
      expect(roh).not.toContain('erfassungToken');
      expect(roh).not.toContain('erfassung_token');
    }
  });

  it('liefert das Token je Fahrzeug an jede geprüfte Identität', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/erfassungslink`),
      { FAHRZEUGE_DB: db as never },
      FREMDE_IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({
      fahrzeugId: ID,
      token: db.fahrzeuge.get(ID)!.erfassung_token,
    });
  });

  it('meldet für ein unbekanntes Fahrzeug 404', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/erfassungslink`),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });

  it('erneuert das Token nur für die Zugführung oder die Gruppenführung der Gruppe', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db, fahrzeugKoerper({ gruppe: 'sanitaet' }));
    const vorher = db.fahrzeuge.get(ID)!.erfassung_token;

    const erneuern = (rolle: string | null) =>
      verarbeiteFahrzeuge(
        anfrage(`/api/fahrzeuge/${ID}/erfassungslink`, { method: 'POST' }),
        { FAHRZEUGE_DB: db as never, BENUTZER_DB: benutzerDb(rolle) as never },
        IDENTITAET,
      );

    expect((await erneuern('helfer')).status).toBe(403);
    expect((await erneuern('gruppenfuehrung-betreuung')).status).toBe(403);
    expect(db.fahrzeuge.get(ID)!.erfassung_token).toBe(vorher);

    const erlaubt = await erneuern('gruppenfuehrung-sanitaet');
    expect(erlaubt.status).toBe(200);
    const nachher = db.fahrzeuge.get(ID)!.erfassung_token;
    expect(nachher).toMatch(/^[0-9a-f]{32}$/);
    expect(nachher).not.toBe(vorher);
  });

  it('protokolliert die Erneuerung, ohne das Token zu nennen', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/erfassungslink`, { method: 'POST' }),
      { FAHRZEUGE_DB: db as never, BENUTZER_DB: benutzerDb('zugfuehrung') as never },
      IDENTITAET,
    );
    const eintrag = db.aenderungen.at(-1)!;
    expect(eintrag.beschreibung).toContain('Erfassungs-QR-Code erneuert');
    expect(eintrag.von).toBe(IDENTITAET.email);
    expect(eintrag.beschreibung).not.toContain(db.fahrzeuge.get(ID)!.erfassung_token!);
  });

  it('listet Erfassungslinks nur für die eigenen Freigabegruppen', async () => {
    const db = new FakeFahrzeugeDb();
    await legeAn(db, fahrzeugKoerper({ gruppe: 'sanitaet' }));
    const zweite = '01234567-89ab-4cde-8fab-0123456789ac';
    await legeAn(db, fahrzeugKoerper({ id: zweite, kennzeichen: 'XY-TE 456', gruppe: 'tesi' }));

    const liste = async (rolle: string | null) => {
      const antwort = await verarbeiteFahrzeuge(
        anfrage('/api/fahrzeuge/erfassungslinks'),
        { FAHRZEUGE_DB: db as never, BENUTZER_DB: benutzerDb(rolle) as never },
        IDENTITAET,
      );
      return (await antwort.json()) as { links: { fahrzeugId: string }[] };
    };

    expect((await liste('zugfuehrung')).links).toHaveLength(2);
    expect((await liste('gruppenfuehrung-tesi')).links.map((l) => l.fahrzeugId)).toEqual([zweite]);
    // Ohne passende Rolle leer statt abgewiesen: der Übersichtsbogen soll für
    // jeden aufrufbar und dann ehrlich leer sein.
    expect((await liste('helfer')).links).toEqual([]);
  });

  it('sperrt die Liste, wenn die Rollenverwaltung nicht eingerichtet ist', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await verarbeiteFahrzeuge(
      anfrage('/api/fahrzeuge/erfassungslinks'),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(503);
  });
});

describe('quelle "oeffentlich" ist kein Client-Wert', () => {
  it('weist eine Ablesung mit quelle "oeffentlich" ab', async () => {
    // Der wichtigste Negativtest dieses Pakets: 'oeffentlich' entsteht
    // ausschließlich intern bei der Freigabe einer Meldung. Wäre der Wert
    // einreichbar, könnte jede angemeldete Person eine Freigabe fingieren.
    const db = new FakeFahrzeugeDb();
    await legeAn(db);
    const antwort = await verarbeiteFahrzeuge(
      anfrage(`/api/fahrzeuge/${ID}/ablesungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abgelesenAm: '2026-09-15',
          stand: 1000,
          quelle: 'oeffentlich',
          korrigiert: null,
          bemerkung: '',
        }),
      }),
      { FAHRZEUGE_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(400);
    expect(await antwort.json()).toMatchObject({ code: 'FAHRZEUGE_DATEI_UNGUELTIG' });
    expect(db.ablesungen).toHaveLength(0);
  });
});
