import { describe, expect, it } from 'vitest';
import { verarbeiteEinsatzplanung } from '../src/einsatzplanung';
import { FakeEinsatzplanungDb } from './einsatzplanung-db-fake';

const IDENTITAET = { email: 'geprueft@example.test' };
const JSON_KOPF = { 'Content-Type': 'application/json' };
const NEU = { 'If-None-Match': '*' };
const LAGER = '/api/einsatzplanung/lager';
const ARTIKEL = '/api/einsatzplanung/artikel';
const KISTEN = '/api/einsatzplanung/kisten';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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

const diagnose = (antwort: Response) => antwort.headers.get('X-Stationwizard-Diagnose');

async function vorbereiten() {
  const db = new FakeEinsatzplanungDb();
  expect((await senden(db, 'POST', LAGER, { id: id(1), name: 'Küchenlager' }, NEU)).status).toBe(
    201,
  );
  for (const [n, name] of [
    [11, 'Öl'],
    [12, 'Pfeffer, Dose'],
    [13, 'Salz'],
  ] as const) {
    const antwort = await senden(
      db,
      'POST',
      ARTIKEL,
      { id: id(n), name, einheit: 'Stück', lagerId: id(1) },
      NEU,
    );
    expect(antwort.status).toBe(201);
  }
  return db;
}

const position = (nummer: number, zusatz: Record<string, unknown> = {}) => ({
  artikelId: id(nummer),
  menge: 1,
  bemerkung: '',
  ...zusatz,
});

const kiste = (nummer: number, zusatz: Record<string, unknown> = {}) => ({
  id: id(nummer),
  name: `Kiste ${nummer}`,
  lagerId: id(1),
  inhalt: [position(11), position(12, { menge: 2.5 })],
  ...zusatz,
});

describe('Kisten', () => {
  it('liefert die Liste leer und danach alphabetisch mit Inhalt', async () => {
    const db = await vorbereiten();
    expect(await (await verarbeiten(db, KISTEN)).json()).toEqual({ kisten: [] });
    await senden(db, 'POST', KISTEN, kiste(52, { name: 'Zubehör' }), NEU);
    await senden(db, 'POST', KISTEN, kiste(51, { name: 'Gewürzkiste' }), NEU);
    const liste = (await (await verarbeiten(db, KISTEN)).json()) as {
      kisten: { name: string; inhalt: { artikelId: string; menge: number }[]; version: number }[];
    };
    expect(liste.kisten.map((k) => [k.name, k.inhalt.length, k.version])).toEqual([
      ['Gewürzkiste', 2, 1],
      ['Zubehör', 2, 1],
    ]);
    expect(liste.kisten[0].inhalt[1]).toMatchObject({ artikelId: id(12), menge: 2.5 });
  });

  it('legt eine Kiste an, setzt Kennzahl und Verwaltungsfelder und gibt den ETag aus', async () => {
    const db = await vorbereiten();
    const antwort = await senden(db, 'POST', KISTEN, kiste(50, { name: '  Gewürz   Kiste ' }), NEU);
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
    expect(await antwort.json()).toMatchObject({
      name: 'Gewürz Kiste',
      lagerId: id(1),
      version: 1,
      geaendertVon: IDENTITAET.email,
    });
    expect(db.kisten.get(id(50))?.positionen).toBe(2);
  });

  it('erlaubt eine Kiste ohne Heimatlager und ohne Inhalt', async () => {
    const db = await vorbereiten();
    const antwort = await senden(db, 'POST', KISTEN, kiste(50, { lagerId: null, inhalt: [] }), NEU);
    expect(antwort.status).toBe(201);
    expect(db.kisten.get(id(50))?.positionen).toBe(0);
  });

  it('verlangt If-None-Match: * zum Anlegen', async () => {
    const db = await vorbereiten();
    expect((await senden(db, 'POST', KISTEN, kiste(50))).status).toBe(428);
  });

  it.each([
    ['unbekanntes Feld', { gewicht: 3 }],
    ['leerer Name', { name: '  ' }],
    ['zu langer Name', { name: 'x'.repeat(101) }],
    ['Heimatlager keine UUID', { lagerId: 'abc' }],
    ['Inhalt keine Liste', { inhalt: 'x' }],
    ['unbekanntes Feld in der Position', { inhalt: [position(11, { einheit: 'Liter' })] }],
    ['Menge null', { inhalt: [position(11, { menge: 0 })] }],
    ['Menge negativ', { inhalt: [position(11, { menge: -1 })] }],
    ['Menge Text', { inhalt: [position(11, { menge: '2' })] }],
    ['Menge mit vier Nachkommastellen', { inhalt: [position(11, { menge: 1.2345 })] }],
    ['Menge zu groß', { inhalt: [position(11, { menge: 1_000_001 })] }],
    ['Bemerkung zu lang', { inhalt: [position(11, { bemerkung: 'x'.repeat(201) })] }],
    ['Bemerkung fehlt', { inhalt: [{ artikelId: id(11), menge: 1 }] }],
    ['Artikel doppelt', { inhalt: [position(11), position(11, { menge: 3 })] }],
    ['zu viele Positionen', { inhalt: Array.from({ length: 101 }, (_, n) => position(1000 + n)) }],
  ])('lehnt ungültige Eingabe ab: %s', async (_titel, zusatz) => {
    const db = await vorbereiten();
    const antwort = await senden(db, 'POST', KISTEN, kiste(50, zusatz), NEU);
    expect(antwort.status).toBe(400);
    expect(db.kisten.size).toBe(0);
  });

  it('nimmt eine Menge mit drei Nachkommastellen und Kommazahlen wie 0,1 an', async () => {
    const db = await vorbereiten();
    const antwort = await senden(
      db,
      'POST',
      KISTEN,
      kiste(50, { inhalt: [position(11, { menge: 0.125 }), position(12, { menge: 0.1 })] }),
      NEU,
    );
    expect(antwort.status).toBe(201);
  });

  it('lehnt ein unbekanntes Heimatlager und einen unbekannten Artikel ab', async () => {
    const db = await vorbereiten();
    const lager = await senden(db, 'POST', KISTEN, kiste(50, { lagerId: id(77) }), NEU);
    expect(lager.status).toBe(400);
    const artikel = await senden(db, 'POST', KISTEN, kiste(50, { inhalt: [position(99)] }), NEU);
    expect(artikel.status).toBe(400);
    expect(db.kisten.size).toBe(0);
  });

  it('erkennt denselben Namen in anderer Schreibweise und eine doppelte Kennung', async () => {
    const db = await vorbereiten();
    await senden(db, 'POST', KISTEN, kiste(50, { name: 'Gewürzkiste' }), NEU);
    const name = await senden(db, 'POST', KISTEN, kiste(51, { name: ' gewürzkiste ' }), NEU);
    expect(name.status).toBe(409);
    expect(diagnose(name)).toBe('EINSATZPLANUNG_NAME_VERGEBEN');
    const kennung = await senden(db, 'POST', KISTEN, kiste(50, { name: 'Andere' }), NEU);
    expect(kennung.status).toBe(409);
    expect(diagnose(kennung)).toBe('EINSATZPLANUNG_BEREITS_VORHANDEN');
  });

  it('ändert mit If-Match (stark und schwach), zählt die Version und tauscht den Inhalt', async () => {
    const db = await vorbereiten();
    await senden(db, 'POST', KISTEN, kiste(50), NEU);
    const url = `${KISTEN}/${id(50)}`;
    const erste = await senden(
      db,
      'PUT',
      url,
      kiste(50, { inhalt: [position(13, { menge: 4 })] }),
      {
        'If-Match': '"1"',
      },
    );
    expect(erste.status).toBe(200);
    expect(erste.headers.get('ETag')).toBe('"2"');
    expect(await erste.json()).toMatchObject({
      version: 2,
      inhalt: [{ artikelId: id(13), menge: 4 }],
    });
    expect(db.kisten.get(id(50))?.positionen).toBe(1);
    const zweite = await senden(db, 'PUT', url, kiste(50, { name: 'Neu' }), {
      'If-Match': 'W/"2"',
    });
    expect(zweite.status).toBe(200);
  });

  it('antwortet bei veralteter Version mit 412, bei fehlendem Header mit 428, bei Fremdem mit 404', async () => {
    const db = await vorbereiten();
    await senden(db, 'POST', KISTEN, kiste(50), NEU);
    const url = `${KISTEN}/${id(50)}`;
    expect((await senden(db, 'PUT', url, kiste(50), { 'If-Match': '"7"' })).status).toBe(412);
    expect((await senden(db, 'PUT', url, kiste(50))).status).toBe(428);
    expect((await senden(db, 'PUT', url, kiste(51), { 'If-Match': '"1"' })).status).toBe(400);
    const unbekannt = await senden(db, 'PUT', `${KISTEN}/${id(80)}`, kiste(80), {
      'If-Match': '"1"',
    });
    expect(unbekannt.status).toBe(404);
    expect(diagnose(unbekannt)).toBe('EINSATZPLANUNG_KISTE_NICHT_GEFUNDEN');
  });

  it('lehnt beim Ändern einen vergebenen Namen ab', async () => {
    const db = await vorbereiten();
    await senden(db, 'POST', KISTEN, kiste(50, { name: 'Eins' }), NEU);
    await senden(db, 'POST', KISTEN, kiste(51, { name: 'Zwei' }), NEU);
    const antwort = await senden(db, 'PUT', `${KISTEN}/${id(51)}`, kiste(51, { name: 'eins' }), {
      'If-Match': '"1"',
    });
    expect(antwort.status).toBe(409);
    expect(diagnose(antwort)).toBe('EINSATZPLANUNG_NAME_VERGEBEN');
  });

  it('löscht mit If-Match, sonst 428, 412 oder 404', async () => {
    const db = await vorbereiten();
    await senden(db, 'POST', KISTEN, kiste(50), NEU);
    const url = `${KISTEN}/${id(50)}`;
    expect((await verarbeiten(db, url, { method: 'DELETE' })).status).toBe(428);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"5"' } })).status,
    ).toBe(412);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(204);
    expect(
      (await verarbeiten(db, url, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(404);
  });

  it('begrenzt die Zahl der Kisten', async () => {
    const db = await vorbereiten();
    for (let n = 1; n <= 300; n += 1) {
      db.kisten.set(id(2000 + n), {
        id: id(2000 + n),
        name: `K${n}`,
        name_vergleich: `k${n}`,
        lager_id: null,
        inhalt: '[]',
        positionen: 0,
        version: 1,
        geaendert_am: 'x',
        geaendert_von: 'y',
      });
    }
    const antwort = await senden(db, 'POST', KISTEN, kiste(50), NEU);
    expect(antwort.status).toBe(409);
    expect(diagnose(antwort)).toBe('EINSATZPLANUNG_GRENZE_ERREICHT');
  });

  it('erlaubt nur die vorgesehenen Methoden und liefert für Unbekanntes ein JSON-404', async () => {
    const db = new FakeEinsatzplanungDb();
    expect((await verarbeiten(db, KISTEN, { method: 'DELETE' })).status).toBe(405);
    expect((await verarbeiten(db, `${KISTEN}/${id(1)}`)).status).toBe(405);
    expect((await verarbeiten(db, `${KISTEN}/keine-uuid`)).status).toBe(404);
    expect((await verarbeiten(db, `${KISTEN}?x=1`)).status).toBe(404);
  });
});

describe('Löschschutz durch Kisten', () => {
  it('sperrt das Löschen eines Artikels, der in einer Kiste steckt', async () => {
    const db = await vorbereiten();
    await senden(db, 'POST', KISTEN, kiste(50), NEU);
    const antwort = await verarbeiten(db, `${ARTIKEL}/${id(11)}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(antwort.status).toBe(409);
    expect(diagnose(antwort)).toBe('EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG');
    expect(db.artikel.has(id(11))).toBe(true);
    // ein Artikel außerhalb der Kiste lässt sich weiter löschen
    const frei = await verarbeiten(db, `${ARTIKEL}/${id(13)}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(frei.status).toBe(204);
  });

  it('gibt den Artikel wieder frei, sobald er aus der Kiste entfernt oder die Kiste gelöscht ist', async () => {
    const db = await vorbereiten();
    await senden(db, 'POST', KISTEN, kiste(50), NEU);
    await senden(db, 'PUT', `${KISTEN}/${id(50)}`, kiste(50, { inhalt: [position(12)] }), {
      'If-Match': '"1"',
    });
    const frei = await verarbeiten(db, `${ARTIKEL}/${id(11)}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(frei.status).toBe(204);
    await verarbeiten(db, `${KISTEN}/${id(50)}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"2"' },
    });
    const nachLoeschen = await verarbeiten(db, `${ARTIKEL}/${id(12)}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(nachLoeschen.status).toBe(204);
  });

  it('sperrt das Löschen eines Lagers, das Heimatlager einer Kiste ist', async () => {
    const db = await vorbereiten();
    // Artikel anders legen, damit nur die Kiste das Lager hält
    for (const n of [11, 12, 13]) db.artikel.delete(id(n));
    await senden(db, 'POST', KISTEN, kiste(50, { inhalt: [] }), NEU);
    const antwort = await verarbeiten(db, `${LAGER}/${id(1)}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(antwort.status).toBe(409);
    expect(diagnose(antwort)).toBe('EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG');
    expect(db.lager.has(id(1))).toBe(true);
  });
});
