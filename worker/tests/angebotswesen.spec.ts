import { describe, expect, it } from 'vitest';
import { verarbeiteAngebotswesen } from '../src/angebotswesen';
import { FakeAngebotswesenDb } from './angebotswesen-db-fake';

const PREISKATALOG_ID = '01234567-89ab-4cde-8fab-0123456789ab';
const ANGEBOT_ID = '11234567-89ab-4cde-8fab-0123456789ab';
const IDENTITAET = { email: 'geprueft@example.test' };

function anfrage(pfad: string, init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

function preiskatalogKoerper(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: PREISKATALOG_ID,
    bezeichnung: 'Sanitätshelfer',
    art: 'einsatzkraft',
    einzelpreisCent: 1200,
    ...ueberschreibung,
  };
}

function schicht(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: 'schicht-1',
    datum: '2026-09-12',
    von: '08:00',
    bis: '20:00',
    positionen: [
      {
        id: 'position-1',
        herkunftEintragId: PREISKATALOG_ID,
        art: 'einsatzkraft',
        bezeichnung: 'Sanitätshelfer',
        einzelpreisCent: 1200,
        anzahl: 2,
        stunden: 1,
      },
    ],
    ...ueberschreibung,
  };
}

function angebotKoerper(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: ANGEBOT_ID,
    bezeichnung: 'Stadtlauf 2026',
    auftraggeber: 'Stadt Testort',
    bemerkung: '',
    schichten: [schicht()],
    pauschalpreisAktiv: false,
    pauschalpreisCent: null,
    ...ueberschreibung,
  };
}

async function verarbeiten(db: FakeAngebotswesenDb, pfad: string, init?: RequestInit) {
  return verarbeiteAngebotswesen(
    anfrage(pfad, init),
    { ANGEBOTSWESEN_DB: db as never },
    IDENTITAET,
  );
}

async function legePreiskatalogAn(db: FakeAngebotswesenDb, koerper = preiskatalogKoerper()) {
  return verarbeiten(db, '/api/angebotswesen/preiskatalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
    body: JSON.stringify(koerper),
  });
}

async function legeAngebotAn(db: FakeAngebotswesenDb, koerper = angebotKoerper()) {
  return verarbeiten(db, '/api/angebotswesen/angebote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
    body: JSON.stringify(koerper),
  });
}

describe('verarbeiteAngebotswesen – ohne Konfiguration', () => {
  it('sperrt ohne D1-Binding statt mit einem Absturz', async () => {
    const antwort = await verarbeiteAngebotswesen(
      anfrage('/api/angebotswesen/preiskatalog'),
      {},
      IDENTITAET,
    );
    expect(antwort.status).toBe(503);
  });
});

describe('Preiskatalog', () => {
  it('legt mit If-None-Match: * einen Eintrag an', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legePreiskatalogAn(db);
    expect(antwort.status).toBe(201);
    const koerper = (await antwort.json()) as { version: number; geaendertVon: string };
    expect(koerper.version).toBe(1);
    expect(koerper.geaendertVon).toBe(IDENTITAET.email);
  });

  it('lehnt die Anlage ohne If-None-Match ab', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await verarbeiten(db, '/api/angebotswesen/preiskatalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preiskatalogKoerper()),
    });
    expect(antwort.status).toBe(428);
  });

  it('lehnt eine zweite Anlage mit derselben id als Konflikt ab', async () => {
    const db = new FakeAngebotswesenDb();
    await legePreiskatalogAn(db);
    const antwort = await legePreiskatalogAn(db);
    expect(antwort.status).toBe(412);
  });

  it('lehnt eine ungültige art ab', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legePreiskatalogAn(db, preiskatalogKoerper({ art: 'unbekannt' }));
    expect(antwort.status).toBe(400);
  });

  it('lehnt einen negativen Preis ab', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legePreiskatalogAn(db, preiskatalogKoerper({ einzelpreisCent: -1 }));
    expect(antwort.status).toBe(400);
  });

  it('listet angelegte Einträge inklusive Version als JSON-Feld', async () => {
    const db = new FakeAngebotswesenDb();
    await legePreiskatalogAn(db);
    const antwort = await verarbeiten(db, '/api/angebotswesen/preiskatalog');
    const koerper = (await antwort.json()) as { eintraege: { version: number }[] };
    expect(koerper.eintraege).toHaveLength(1);
    expect(koerper.eintraege[0].version).toBe(1);
  });

  it('lehnt ein Update ohne If-Match ab', async () => {
    const db = new FakeAngebotswesenDb();
    await legePreiskatalogAn(db);
    const antwort = await verarbeiten(db, `/api/angebotswesen/preiskatalog/${PREISKATALOG_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preiskatalogKoerper({ bezeichnung: 'Neu' })),
    });
    expect(antwort.status).toBe(428);
  });

  it('aktualisiert mit passendem If-Match und erhöht die Version', async () => {
    const db = new FakeAngebotswesenDb();
    await legePreiskatalogAn(db);
    const antwort = await verarbeiten(db, `/api/angebotswesen/preiskatalog/${PREISKATALOG_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
      body: JSON.stringify(preiskatalogKoerper({ einzelpreisCent: 1300 })),
    });
    expect(antwort.status).toBe(200);
    const koerper = (await antwort.json()) as { version: number; einzelpreisCent: number };
    expect(koerper.version).toBe(2);
    expect(koerper.einzelpreisCent).toBe(1300);
  });

  it('lehnt ein Update mit veralteter Version als Konflikt ab', async () => {
    const db = new FakeAngebotswesenDb();
    await legePreiskatalogAn(db);
    const antwort = await verarbeiten(db, `/api/angebotswesen/preiskatalog/${PREISKATALOG_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"99"' },
      body: JSON.stringify(preiskatalogKoerper()),
    });
    expect(antwort.status).toBe(412);
  });

  it('löscht einen Eintrag und liefert danach 404 beim erneuten Löschen', async () => {
    const db = new FakeAngebotswesenDb();
    await legePreiskatalogAn(db);
    const erste = await verarbeiten(db, `/api/angebotswesen/preiskatalog/${PREISKATALOG_ID}`, {
      method: 'DELETE',
    });
    expect(erste.status).toBe(204);
    const zweite = await verarbeiten(db, `/api/angebotswesen/preiskatalog/${PREISKATALOG_ID}`, {
      method: 'DELETE',
    });
    expect(zweite.status).toBe(404);
  });

  it('weist eine unbekannte Methode mit 405 und Allow-Header ab', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await verarbeiten(db, '/api/angebotswesen/preiskatalog', { method: 'DELETE' });
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET, POST');
  });
});

describe('Angebote', () => {
  it('legt mit If-None-Match: * ein Angebot an und liefert ein ETag', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legeAngebotAn(db);
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
  });

  it('lehnt eine Schicht mit bis <= von ab', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legeAngebotAn(
      db,
      angebotKoerper({ schichten: [schicht({ von: '20:00', bis: '08:00' })] }),
    );
    expect(antwort.status).toBe(400);
  });

  it('lehnt eine Fahrzeug-Position mit gesetzten Stunden ab', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legeAngebotAn(
      db,
      angebotKoerper({
        schichten: [
          schicht({
            positionen: [
              {
                id: 'position-1',
                herkunftEintragId: null,
                art: 'fahrzeug',
                bezeichnung: 'KTW/RTW',
                einzelpreisCent: 5000,
                anzahl: 1,
                stunden: 5,
              },
            ],
          }),
        ],
      }),
    );
    expect(antwort.status).toBe(400);
  });

  it('verlangt einen Pauschalpreis, wenn pauschalpreisAktiv gesetzt ist', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legeAngebotAn(
      db,
      angebotKoerper({ pauschalpreisAktiv: true, pauschalpreisCent: null }),
    );
    expect(antwort.status).toBe(400);
  });

  it('akzeptiert pauschalpreisCent = 0 als gültigen Override', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await legeAngebotAn(
      db,
      angebotKoerper({ pauschalpreisAktiv: true, pauschalpreisCent: 0 }),
    );
    expect(antwort.status).toBe(201);
  });

  it('liefert 404 für ein unbekanntes Angebot', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await verarbeiten(db, `/api/angebotswesen/angebote/${ANGEBOT_ID}`);
    expect(antwort.status).toBe(404);
  });

  it('listet angelegte Angebote inklusive Schichten', async () => {
    const db = new FakeAngebotswesenDb();
    await legeAngebotAn(db);
    const antwort = await verarbeiten(db, '/api/angebotswesen/angebote');
    const koerper = (await antwort.json()) as { angebote: { schichten: unknown[] }[] };
    expect(koerper.angebote).toHaveLength(1);
    expect(koerper.angebote[0].schichten).toHaveLength(1);
  });

  it('aktualisiert mit passendem If-Match und erhöht die Version', async () => {
    const db = new FakeAngebotswesenDb();
    await legeAngebotAn(db);
    const antwort = await verarbeiten(db, `/api/angebotswesen/angebote/${ANGEBOT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
      body: JSON.stringify(angebotKoerper({ bezeichnung: 'Geändert' })),
    });
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('ETag')).toBe('"2"');
  });

  it('lehnt ein Update mit veralteter Version als Konflikt ab', async () => {
    const db = new FakeAngebotswesenDb();
    await legeAngebotAn(db);
    const antwort = await verarbeiten(db, `/api/angebotswesen/angebote/${ANGEBOT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"99"' },
      body: JSON.stringify(angebotKoerper()),
    });
    expect(antwort.status).toBe(412);
  });

  it('löscht ein Angebot und liefert danach 404', async () => {
    const db = new FakeAngebotswesenDb();
    await legeAngebotAn(db);
    const erste = await verarbeiten(db, `/api/angebotswesen/angebote/${ANGEBOT_ID}`, {
      method: 'DELETE',
    });
    expect(erste.status).toBe(204);
    const zweite = await verarbeiten(db, `/api/angebotswesen/angebote/${ANGEBOT_ID}`);
    expect(zweite.status).toBe(404);
  });

  it('lehnt einen fehlerhaften Inhaltstyp ab', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await verarbeiten(db, '/api/angebotswesen/angebote', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'If-None-Match': '*' },
      body: JSON.stringify(angebotKoerper()),
    });
    expect(antwort.status).toBe(415);
  });
});

describe('unbekannte Pfade', () => {
  it('liefert 404 für einen unbekannten Angebotswesen-Pfad', async () => {
    const db = new FakeAngebotswesenDb();
    const antwort = await verarbeiten(db, '/api/angebotswesen/unbekannt');
    expect(antwort.status).toBe(404);
  });
});
