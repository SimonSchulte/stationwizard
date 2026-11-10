import { describe, expect, it } from 'vitest';
import { verarbeiteEinsatzplanung } from '../src/einsatzplanung';
import { FakeEinsatzplanungDb } from './einsatzplanung-db-fake';

const IDENTITAET = { email: 'geprueft@example.test' };
const JSON_KOPF = { 'Content-Type': 'application/json' };
const NEU = { 'If-None-Match': '*' };
const LAGER = '/api/einsatzplanung/lager';
const ARTIKEL = '/api/einsatzplanung/artikel';

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

async function verarbeiten(db: FakeEinsatzplanungDb, pfad: string, init?: RequestInit) {
  return verarbeiteEinsatzplanung(
    new Request(`https://stationwizard.example.test${pfad}`, init),
    { EINSATZPLANUNG_DB: db as never },
    IDENTITAET,
  );
}

function senden(
  db: FakeEinsatzplanungDb,
  methode: string,
  pfad: string,
  koerper: unknown,
  kopf: Record<string, string> = {},
) {
  return verarbeiten(db, pfad, {
    method: methode,
    headers: { ...JSON_KOPF, ...kopf },
    body: JSON.stringify(koerper),
  });
}

async function diagnose(antwort: Response): Promise<string | null> {
  return antwort.headers.get('X-Stationwizard-Diagnose');
}

async function lagerAnlegen(db: FakeEinsatzplanungDb, nummer: number, name: string) {
  const antwort = await senden(db, 'POST', LAGER, { id: id(nummer), name }, NEU);
  expect(antwort.status).toBe(201);
  return antwort;
}

describe('Lager', () => {
  it('liefert die Liste leer und dann in der Reihenfolge der Anlage', async () => {
    const db = new FakeEinsatzplanungDb();
    const leer = await verarbeiten(db, LAGER);
    expect(await leer.json()).toEqual({ lager: [] });
    await lagerAnlegen(db, 1, 'Küchenlager');
    await lagerAnlegen(db, 2, 'Kaltlager');
    const liste = (await (await verarbeiten(db, LAGER)).json()) as {
      lager: { id: string; name: string; reihenfolge: number; version: number }[];
    };
    expect(liste.lager.map((l) => [l.name, l.reihenfolge, l.version])).toEqual([
      ['Küchenlager', 1, 1],
      ['Kaltlager', 2, 1],
    ]);
  });

  it('verlangt zum Anlegen If-None-Match: * und lehnt If-Match dabei ab', async () => {
    const db = new FakeEinsatzplanungDb();
    const ohne = await senden(db, 'POST', LAGER, { id: id(1), name: 'A' });
    expect(ohne.status).toBe(428);
    const gemischt = await senden(
      db,
      'POST',
      LAGER,
      { id: id(1), name: 'A' },
      { ...NEU, 'If-Match': '"1"' },
    );
    expect(gemischt.status).toBe(400);
  });

  it.each([
    ['unbekanntes Feld', { id: id(1), name: 'A', reihenfolge: 3 }],
    ['leerer Name', { id: id(1), name: '   ' }],
    ['zu langer Name', { id: id(1), name: 'x'.repeat(101) }],
    ['keine Kennung', { name: 'A' }],
    ['Kennung keine UUID', { id: 'abc', name: 'A' }],
    ['Name keine Zeichenkette', { id: id(1), name: 5 }],
  ])('lehnt ungültige Eingabe ab: %s', async (_titel, koerper) => {
    const antwort = await senden(new FakeEinsatzplanungDb(), 'POST', LAGER, koerper, NEU);
    expect(antwort.status).toBe(400);
  });

  it('bereinigt den Namen und erkennt dasselbe Lager in anderer Schreibweise', async () => {
    const db = new FakeEinsatzplanungDb();
    const erste = await lagerAnlegen(db, 1, '  Lager   Nord ');
    expect(((await erste.json()) as { name: string }).name).toBe('Lager Nord');
    const doppelt = await senden(db, 'POST', LAGER, { id: id(2), name: 'lager nord' }, NEU);
    expect(doppelt.status).toBe(409);
    expect(await diagnose(doppelt)).toBe('EINSATZPLANUNG_NAME_VERGEBEN');
    expect(db.lager.size).toBe(1);
  });

  it('meldet eine doppelte Kennung getrennt vom doppelten Namen', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'A');
    const antwort = await senden(db, 'POST', LAGER, { id: id(1), name: 'B' }, NEU);
    expect(antwort.status).toBe(409);
    expect(await diagnose(antwort)).toBe('EINSATZPLANUNG_BEREITS_VORHANDEN');
  });

  it('ändert den Namen mit If-Match (stark und schwach) und zählt die Version hoch', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'Kaltlager');
    const stark = await senden(
      db,
      'PUT',
      `${LAGER}/${id(1)}`,
      { id: id(1), name: 'Kühllager' },
      {
        'If-Match': '"1"',
      },
    );
    expect(stark.status).toBe(200);
    expect(stark.headers.get('ETag')).toBe('"2"');
    const koerper = (await stark.json()) as { name: string; version: number; geaendertVon: string };
    expect(koerper).toMatchObject({
      name: 'Kühllager',
      version: 2,
      geaendertVon: IDENTITAET.email,
    });
    const schwach = await senden(
      db,
      'PUT',
      `${LAGER}/${id(1)}`,
      { id: id(1), name: 'Kühl' },
      {
        'If-Match': 'W/"2"',
      },
    );
    expect(schwach.status).toBe(200);
  });

  it('antwortet bei veralteter Version mit 412 und behält den Stand', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'A');
    await senden(db, 'PUT', `${LAGER}/${id(1)}`, { id: id(1), name: 'B' }, { 'If-Match': '"1"' });
    const alt = await senden(
      db,
      'PUT',
      `${LAGER}/${id(1)}`,
      { id: id(1), name: 'C' },
      {
        'If-Match': '"1"',
      },
    );
    expect(alt.status).toBe(412);
    expect(db.lager.get(id(1))?.name).toBe('B');
  });

  it('verlangt zum Ändern If-Match und die passende Kennung im Körper', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'A');
    expect((await senden(db, 'PUT', `${LAGER}/${id(1)}`, { id: id(1), name: 'B' })).status).toBe(
      428,
    );
    const fremd = await senden(
      db,
      'PUT',
      `${LAGER}/${id(1)}`,
      { id: id(2), name: 'B' },
      {
        'If-Match': '"1"',
      },
    );
    expect(fremd.status).toBe(400);
  });

  it('lehnt beim Umbenennen einen schon vergebenen Namen ab', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'A');
    await lagerAnlegen(db, 2, 'B');
    const antwort = await senden(
      db,
      'PUT',
      `${LAGER}/${id(2)}`,
      { id: id(2), name: ' a ' },
      {
        'If-Match': '"1"',
      },
    );
    expect(antwort.status).toBe(409);
    expect(await diagnose(antwort)).toBe('EINSATZPLANUNG_NAME_VERGEBEN');
  });

  it('antwortet für ein unbekanntes Lager mit 404', async () => {
    const db = new FakeEinsatzplanungDb();
    const antwort = await senden(
      db,
      'PUT',
      `${LAGER}/${id(9)}`,
      { id: id(9), name: 'A' },
      {
        'If-Match': '"1"',
      },
    );
    expect(antwort.status).toBe(404);
    expect(await diagnose(antwort)).toBe('EINSATZPLANUNG_LAGER_NICHT_GEFUNDEN');
  });

  it('löscht mit If-Match, sonst 428, 412 oder 404', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'A');
    const url = `${LAGER}/${id(1)}`;
    expect((await verarbeiten(db, url, { method: 'DELETE' })).status).toBe(428);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"7"' } })).status,
    ).toBe(412);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(204);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(404);
  });

  it('sperrt das Löschen, solange Artikel das Lager als Heimatlager haben', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'Kaltlager');
    await senden(
      db,
      'POST',
      ARTIKEL,
      { id: id(11), name: 'Gasflasche', einheit: 'Stück', lagerId: id(1) },
      NEU,
    );
    const antwort = await verarbeiten(db, `${LAGER}/${id(1)}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(antwort.status).toBe(409);
    expect(await diagnose(antwort)).toBe('EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG');
    expect(db.lager.size).toBe(1);
  });

  it('begrenzt die Zahl der Lager', async () => {
    const db = new FakeEinsatzplanungDb();
    for (let n = 1; n <= 100; n += 1) {
      db.lager.set(id(n), {
        id: id(n),
        name: `L${n}`,
        name_vergleich: `l${n}`,
        reihenfolge: n,
        version: 1,
        geaendert_am: 'x',
        geaendert_von: 'y',
      });
    }
    const antwort = await senden(db, 'POST', LAGER, { id: id(500), name: 'Neu' }, NEU);
    expect(antwort.status).toBe(409);
    expect(await diagnose(antwort)).toBe('EINSATZPLANUNG_GRENZE_ERREICHT');
  });
});

describe('Lagerreihenfolge', () => {
  const REIHENFOLGE = `${LAGER}/reihenfolge`;

  async function dreiLager(db: FakeEinsatzplanungDb) {
    await lagerAnlegen(db, 1, 'Küchenlager');
    await lagerAnlegen(db, 2, 'Kaltlager');
    await lagerAnlegen(db, 3, 'Dachboden');
  }

  it('nummeriert in einem Schreibvorgang neu und fasst nur geänderte Zeilen an', async () => {
    const db = new FakeEinsatzplanungDb();
    await dreiLager(db);
    const antwort = await senden(db, 'PUT', REIHENFOLGE, { ids: [id(1), id(3), id(2)] });
    expect(antwort.status).toBe(200);
    const liste = (await antwort.json()) as { lager: { name: string; reihenfolge: number }[] };
    expect(liste.lager.map((l) => l.name)).toEqual(['Küchenlager', 'Dachboden', 'Kaltlager']);
    expect(db.batches).toBe(1);
    expect(db.lager.get(id(1))?.geaendert_am).not.toBe(undefined);
  });

  it('ist idempotent und schreibt bei unveränderter Reihenfolge nichts', async () => {
    const db = new FakeEinsatzplanungDb();
    await dreiLager(db);
    const antwort = await senden(db, 'PUT', REIHENFOLGE, { ids: [id(1), id(2), id(3)] });
    expect(antwort.status).toBe(200);
    expect(db.batches).toBe(0);
  });

  it('antwortet mit 412, wenn sich die Menge der Lager geändert hat', async () => {
    const db = new FakeEinsatzplanungDb();
    await dreiLager(db);
    const zuWenig = await senden(db, 'PUT', REIHENFOLGE, { ids: [id(1), id(2)] });
    expect(zuWenig.status).toBe(412);
    const fremd = await senden(db, 'PUT', REIHENFOLGE, { ids: [id(1), id(2), id(9)] });
    expect(fremd.status).toBe(412);
    expect(db.batches).toBe(0);
  });

  it.each([
    ['kein Feld ids', { reihenfolge: [] }],
    ['unbekanntes Feld', { ids: [], extra: 1 }],
    ['keine Liste', { ids: 'x' }],
    ['keine UUID', { ids: ['abc'] }],
    ['doppelte Kennung', { ids: [id(1), id(1)] }],
  ])('lehnt ungültigen Körper ab: %s', async (_titel, koerper) => {
    const db = new FakeEinsatzplanungDb();
    expect((await senden(db, 'PUT', REIHENFOLGE, koerper)).status).toBe(400);
  });

  it('erlaubt nur PUT', async () => {
    const antwort = await verarbeiten(new FakeEinsatzplanungDb(), REIHENFOLGE);
    expect(antwort.status).toBe(405);
  });
});

describe('Artikel', () => {
  const artikel = (nummer: number, zusatz: Record<string, unknown> = {}) => ({
    id: id(nummer),
    name: `Artikel ${nummer}`,
    einheit: 'Stück',
    lagerId: null,
    ...zusatz,
  });

  it('liefert den ganzen Katalog alphabetisch in einem Aufruf', async () => {
    const db = new FakeEinsatzplanungDb();
    await senden(db, 'POST', ARTIKEL, artikel(2, { name: 'Zucker', einheit: 'Packung' }), NEU);
    await senden(db, 'POST', ARTIKEL, artikel(1, { name: 'Besen' }), NEU);
    const liste = (await (await verarbeiten(db, ARTIKEL)).json()) as {
      artikel: { name: string; einheit: string; lagerId: string | null; version: number }[];
    };
    expect(liste.artikel.map((a) => [a.name, a.einheit, a.lagerId, a.version])).toEqual([
      ['Besen', 'Stück', null, 1],
      ['Zucker', 'Packung', null, 1],
    ]);
  });

  it('legt einen Artikel mit Heimatlager an', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'Kaltlager');
    const antwort = await senden(db, 'POST', ARTIKEL, artikel(5, { lagerId: id(1) }), NEU);
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
    expect(await antwort.json()).toMatchObject({ lagerId: id(1), geaendertVon: IDENTITAET.email });
  });

  it.each([
    ['unbekannte Einheit', { einheit: 'Eimer' }],
    ['unbekanntes Feld', { gewicht: 3 }],
    ['leerer Name', { name: ' ' }],
    ['lagerId keine UUID', { lagerId: 'abc' }],
    ['lagerId fehlt nicht erlaubt als Zahl', { lagerId: 5 }],
  ])('lehnt ungültige Eingabe ab: %s', async (_titel, zusatz) => {
    const antwort = await senden(
      new FakeEinsatzplanungDb(),
      'POST',
      ARTIKEL,
      artikel(1, zusatz),
      NEU,
    );
    expect(antwort.status).toBe(400);
  });

  it('lehnt ein unbekanntes Heimatlager ab', async () => {
    const db = new FakeEinsatzplanungDb();
    const antwort = await senden(db, 'POST', ARTIKEL, artikel(1, { lagerId: id(77) }), NEU);
    expect(antwort.status).toBe(400);
    expect(db.artikel.size).toBe(0);
  });

  it('erkennt denselben Artikel in anderer Schreibweise', async () => {
    const db = new FakeEinsatzplanungDb();
    await senden(db, 'POST', ARTIKEL, artikel(1, { name: 'Gasflasche 5 kg' }), NEU);
    const antwort = await senden(
      db,
      'POST',
      ARTIKEL,
      artikel(2, { name: 'gasflasche  5 KG' }),
      NEU,
    );
    expect(antwort.status).toBe(409);
    expect(await diagnose(antwort)).toBe('EINSATZPLANUNG_NAME_VERGEBEN');
  });

  it('ändert mit If-Match, setzt das Lager zurück und meldet Konflikte', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'Kaltlager');
    await senden(db, 'POST', ARTIKEL, artikel(1, { lagerId: id(1) }), NEU);
    const url = `${ARTIKEL}/${id(1)}`;
    const geaendert = await senden(db, 'PUT', url, artikel(1, { name: 'Neu', einheit: 'Liter' }), {
      'If-Match': '"1"',
    });
    expect(geaendert.status).toBe(200);
    expect(await geaendert.json()).toMatchObject({
      name: 'Neu',
      einheit: 'Liter',
      lagerId: null,
      version: 2,
    });
    const alt = await senden(db, 'PUT', url, artikel(1), { 'If-Match': '"1"' });
    expect(alt.status).toBe(412);
    const unbekannt = await senden(db, 'PUT', `${ARTIKEL}/${id(8)}`, artikel(8), {
      'If-Match': '"1"',
    });
    expect(unbekannt.status).toBe(404);
  });

  it('löscht mit If-Match', async () => {
    const db = new FakeEinsatzplanungDb();
    await senden(db, 'POST', ARTIKEL, artikel(1), NEU);
    const url = `${ARTIKEL}/${id(1)}`;
    expect((await verarbeiten(db, url, { method: 'DELETE' })).status).toBe(428);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"2"' } })).status,
    ).toBe(412);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(204);
    expect(db.artikel.size).toBe(0);
  });

  it('begrenzt die Zahl der Artikel', async () => {
    const db = new FakeEinsatzplanungDb();
    for (let n = 1; n <= 2000; n += 1) {
      db.artikel.set(id(n), {
        id: id(n),
        name: `A${n}`,
        name_vergleich: `a${n}`,
        einheit: 'Stück',
        lager_id: null,
        version: 1,
        geaendert_am: 'x',
        geaendert_von: 'y',
      });
    }
    const antwort = await senden(db, 'POST', ARTIKEL, artikel(5000), NEU);
    expect(antwort.status).toBe(409);
    expect(await diagnose(antwort)).toBe('EINSATZPLANUNG_GRENZE_ERREICHT');
  });
});

describe('Stammdaten: Verteiler', () => {
  it.each([
    [LAGER, 'DELETE'],
    [ARTIKEL, 'PUT'],
    [`${LAGER}/${id(1)}`, 'GET'],
    [`${ARTIKEL}/${id(1)}`, 'POST'],
  ])('lehnt %s mit %s ab', async (pfad, methode) => {
    const antwort = await verarbeiten(new FakeEinsatzplanungDb(), pfad, { method: methode });
    expect(antwort.status).toBe(405);
  });

  it.each([
    `${LAGER}/keine-uuid`,
    `${ARTIKEL}/keine-uuid`,
    `${LAGER}?x=1`,
    `${ARTIKEL}/${id(1)}/x`,
  ])('liefert für %s ein JSON-404', async (pfad) => {
    const antwort = await verarbeiten(new FakeEinsatzplanungDb(), pfad);
    expect(antwort.status).toBe(404);
    expect(antwort.headers.get('Content-Type')).toContain('application/json');
  });

  it('nimmt eine in Großbuchstaben geschriebene Kennung im Pfad an', async () => {
    const db = new FakeEinsatzplanungDb();
    await lagerAnlegen(db, 1, 'A');
    const gross = `${LAGER}/${id(1).toUpperCase()}`;
    const antwort = await senden(
      db,
      'PUT',
      gross,
      { id: id(1).toUpperCase(), name: 'B' },
      {
        'If-Match': '"1"',
      },
    );
    expect(antwort.status).toBe(200);
  });
});
