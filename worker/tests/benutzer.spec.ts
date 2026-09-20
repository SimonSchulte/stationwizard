import { describe, expect, it } from 'vitest';
import { registriereZugriff, verarbeiteBenutzerverwaltung } from '../src/benutzer';
import { FakeBenutzerDb } from './benutzer-db-fake';

const IDENTITAET = { email: 'admin@example.test' };
const ANDERE_IDENTITAET = { email: 'jemand-anders@example.test' };
const ANGEMELDET = 'angemeldet@example.test';

function anfrage(pfad: string, init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

async function rolleAntwort(
  db: FakeBenutzerDb,
  email: string,
  koerper: unknown,
  identitaet = IDENTITAET,
) {
  return verarbeiteBenutzerverwaltung(
    anfrage(`/api/benutzerverwaltung/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(koerper),
    }),
    { BENUTZER_DB: db as never },
    identitaet,
  );
}

describe('verarbeiteBenutzerverwaltung – ohne Konfiguration', () => {
  it('sperrt ohne D1-Binding statt mit einem Absturz', async () => {
    const antwort = await verarbeiteBenutzerverwaltung(
      anfrage('/api/benutzerverwaltung'),
      {},
      IDENTITAET,
    );
    expect(antwort.status).toBe(503);
  });
});

describe('registriereZugriff', () => {
  it('legt eine neue Zeile beim ersten Zugriff an', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    expect(db.benutzer.get(ANGEMELDET)?.rolle).toBeNull();
    expect(db.benutzer.get(ANGEMELDET)?.erster_zugriff_am).toBeTruthy();
  });

  it('aktualisiert nur letzter_zugriff_am bei erneutem Zugriff, erster_zugriff_am bleibt', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const ersterZugriff = db.benutzer.get(ANGEMELDET)?.erster_zugriff_am;
    db.benutzer.set(ANGEMELDET, {
      ...db.benutzer.get(ANGEMELDET)!,
      letzter_zugriff_am: '2020-01-01T00:00:00.000Z',
    });
    await registriereZugriff(db as never, ANGEMELDET);
    expect(db.benutzer.get(ANGEMELDET)?.erster_zugriff_am).toBe(ersterZugriff);
    expect(db.benutzer.get(ANGEMELDET)?.letzter_zugriff_am).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('schreibt am selben Kalendertag kein zweites Mal', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const nachErstemZugriff = db.benutzer.get(ANGEMELDET)?.letzter_zugriff_am;
    await registriereZugriff(db as never, ANGEMELDET);
    // Jeder Sitzungsstart kostet sonst eine D1-Schreibung, ohne dass sich der
    // fachlich tagesgenaue Wert ändert.
    expect(db.benutzer.get(ANGEMELDET)?.letzter_zugriff_am).toBe(nachErstemZugriff);
  });
});

describe('GET /api/benutzerverwaltung', () => {
  it('listet alle bekannten Anmeldungen', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await verarbeiteBenutzerverwaltung(
      anfrage('/api/benutzerverwaltung'),
      { BENUTZER_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    const koerper = (await antwort.json()) as { benutzer: { email: string }[] };
    expect(koerper.benutzer).toHaveLength(1);
    expect(koerper.benutzer[0].email).toBe(ANGEMELDET);
  });
});

describe('PUT /api/benutzerverwaltung/<email>', () => {
  it('setzt Rolle und Sonderrollen und merkt sich, wer geändert hat', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await rolleAntwort(db, ANGEMELDET, {
      rolle: 'helfer',
      sonderrollen: ['verwaltungshelfer'],
    });
    expect(antwort.status).toBe(200);
    const koerper = (await antwort.json()) as {
      rolle: string;
      sonderrollen: string[];
      rolleGeaendertVon: string;
    };
    expect(koerper.rolle).toBe('helfer');
    expect(koerper.sonderrollen).toEqual(['verwaltungshelfer']);
    expect(koerper.rolleGeaendertVon).toBe(IDENTITAET.email);
  });

  it('erlaubt Verwaltungshelfer unabhängig von der Hauptrolle', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await rolleAntwort(db, ANGEMELDET, {
      rolle: 'zugfuehrung',
      sonderrollen: ['verwaltungshelfer'],
    });
    const koerper = (await antwort.json()) as { rolle: string; sonderrollen: string[] };
    expect(koerper.rolle).toBe('zugfuehrung');
    expect(koerper.sonderrollen).toEqual(['verwaltungshelfer']);
  });

  it('erlaubt Verwaltungshelfer und Sanitätsdienste kombiniert', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await rolleAntwort(db, ANGEMELDET, {
      rolle: 'helfer',
      sonderrollen: ['verwaltungshelfer', 'sanitaetsdienste'],
    });
    const koerper = (await antwort.json()) as { sonderrollen: string[] };
    expect(koerper.sonderrollen).toEqual(['verwaltungshelfer', 'sanitaetsdienste']);
  });

  it('erlaubt das Zurücksetzen auf keine Rolle', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    await rolleAntwort(db, ANGEMELDET, { rolle: 'helfer', sonderrollen: [] });
    const antwort = await rolleAntwort(db, ANGEMELDET, { rolle: null, sonderrollen: [] });
    const koerper = (await antwort.json()) as { rolle: string | null };
    expect(koerper.rolle).toBeNull();
  });

  it('lehnt eine unbekannte Rolle ab', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await rolleAntwort(db, ANGEMELDET, {
      rolle: 'erfundene-rolle',
      sonderrollen: [],
    });
    expect(antwort.status).toBe(400);
  });

  it('lehnt eine unbekannte Sonderrolle ab', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await rolleAntwort(db, ANGEMELDET, {
      rolle: null,
      sonderrollen: ['erfunden'],
    });
    expect(antwort.status).toBe(400);
  });

  it('lehnt doppelte Sonderrollen ab', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await rolleAntwort(db, ANGEMELDET, {
      rolle: null,
      sonderrollen: ['verwaltungshelfer', 'verwaltungshelfer'],
    });
    expect(antwort.status).toBe(400);
  });

  it('liefert 404 für eine Person, die sich noch nie angemeldet hat', async () => {
    const db = new FakeBenutzerDb();
    const antwort = await rolleAntwort(db, 'unbekannt@example.test', {
      rolle: 'helfer',
      sonderrollen: [],
    });
    expect(antwort.status).toBe(404);
  });

  it('lehnt Anfragen ohne JSON-Inhaltstyp ab', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await verarbeiteBenutzerverwaltung(
      anfrage(`/api/benutzerverwaltung/${encodeURIComponent(ANGEMELDET)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: 'nope',
      }),
      { BENUTZER_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(415);
  });

  it('lässt auch eine andere geprüfte Identität Rollen setzen (vorerst offen)', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, ANGEMELDET);
    const antwort = await rolleAntwort(
      db,
      ANGEMELDET,
      { rolle: 'helfer', sonderrollen: [] },
      ANDERE_IDENTITAET,
    );
    expect(antwort.status).toBe(200);
  });
});

describe('unbekannte Pfade und Methoden', () => {
  it('liefert 404 für einen unbekannten Unterpfad', async () => {
    const db = new FakeBenutzerDb();
    const antwort = await verarbeiteBenutzerverwaltung(
      anfrage('/api/benutzerverwaltung/x/y'),
      { BENUTZER_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });

  it('lehnt POST auf die Liste ab', async () => {
    const db = new FakeBenutzerDb();
    const antwort = await verarbeiteBenutzerverwaltung(
      anfrage('/api/benutzerverwaltung', { method: 'POST' }),
      { BENUTZER_DB: db as never },
      IDENTITAET,
    );
    expect(antwort.status).toBe(405);
  });
});
