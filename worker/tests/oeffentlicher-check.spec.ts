import { describe, expect, it } from 'vitest';
import { verarbeiteOeffentlichenCheck } from '../src/oeffentlicher-check';
import { FakeMaterialDb } from './material-db-fake';

const URSPRUNG = 'https://stationwizard.example.test';
const TOKEN = '0'.repeat(31) + '1';
const FALSCHES_TOKEN = 'f'.repeat(32);
const ARTIKEL_ID = '4e465201-0000-4000-8000-000000000001';

function db(): FakeMaterialDb {
  const datenbank = new FakeMaterialDb();
  datenbank.fahrzeuge.set('f1', {
    id: 'f1',
    bezeichnung: 'GW SAN Übung',
    funkrufname: 'Florian Testort 1/59/1',
    gruppe: 'sanitaet',
  });
  datenbank.vorlagen.set('v1', {
    id: 'v1',
    bezeichnung: 'Erfundene Prüfvorlage',
    beschreibung: '',
    grundlage: 'Erfundene Grundlage',
    inhalt: JSON.stringify([
      {
        id: 'fach1',
        bezeichnung: 'Erstes Fach',
        artikel: [
          {
            id: ARTIKEL_ID,
            bezeichnung: 'Erfundene Binde',
            sollMenge: 2,
            einheit: '',
            herkunft: 'land',
            verfallsdatumPflicht: true,
          },
        ],
      },
    ]),
    geaendert_am: '2026-01-01T00:00:00.000Z',
    geaendert_von: 'test@example.test',
    version: 1,
  });
  datenbank.behaelter.set('b1', {
    id: 'b1',
    fahrzeug_id: 'f1',
    vorlage_id: 'v1',
    bezeichnung: 'NFR 3',
    bemerkung: '',
    check_token: TOKEN,
    check_token_am: '2026-01-01T00:00:00.000Z',
    geaendert_am: '2026-01-01T00:00:00.000Z',
    geaendert_von: 'test@example.test',
    version: 1,
  });
  return datenbank;
}

function meldung(ueberschreibung: Record<string, unknown> = {}) {
  return {
    name: 'A. Person',
    bemerkung: '',
    verfallsdatumErfasst: true,
    positionen: [
      {
        artikelId: ARTIKEL_ID,
        geprueft: true,
        istMenge: 1,
        unbrauchbar: false,
        verfallsdaten: [null, '2027-05'],
      },
    ],
    ...ueberschreibung,
  };
}

function verarbeite(datenbank: FakeMaterialDb | null, token: string, init?: RequestInit) {
  const url = new URL(`${URSPRUNG}/api/oeffentlich/check/${token}`);
  return verarbeiteOeffentlichenCheck(
    new Request(url, init),
    datenbank ? { FAHRZEUGE_DB: datenbank as never } : {},
    url,
    token,
  );
}

function sende(datenbank: FakeMaterialDb, koerper: unknown, token = TOKEN) {
  return verarbeite(datenbank, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: URSPRUNG },
    body: JSON.stringify(koerper),
  });
}

describe('GET /api/oeffentlich/check/<TOKEN>', () => {
  it('liefert Behälter, Fahrzeug und Soll-Liste', async () => {
    const antwort = await verarbeite(db(), TOKEN);
    expect(antwort.status).toBe(200);
    const inhalt = (await antwort.json()) as {
      behaelterBezeichnung: string;
      vorlage: { faecher: unknown[] };
    };
    expect(inhalt.behaelterBezeichnung).toBe('NFR 3');
    expect(inhalt.vorlage.faecher).toHaveLength(1);
  });

  it('gibt weder Kennungen noch Kennzeichen, Gruppe oder frühere Checks preis', async () => {
    const datenbank = db();
    datenbank.checks.push({
      id: 'c1',
      behaelter_id: 'b1',
      geprueft_am: '2026-05-01',
      erfasst_am: '2026-05-01T08:00:00.000Z',
      fehlmengen: 0,
      unbrauchbar: 0,
      abgelaufen: 0,
    });
    const text = await (await verarbeite(datenbank, TOKEN)).text();
    expect(text).not.toContain('b1');
    expect(text).not.toContain('f1');
    expect(text).not.toContain('sanitaet');
    expect(text).not.toContain('2026-05-01');
    expect(text).not.toContain(TOKEN);
  });

  it('antwortet auf unbekanntes und formal ungültiges Token byteweise gleich', async () => {
    const a = await verarbeite(db(), FALSCHES_TOKEN);
    const b = await verarbeite(db(), 'viel-zu-kurz');
    expect(a.status).toBe(b.status);
    expect(a.status).toBe(404);
    expect(await a.text()).toBe(await b.text());
    expect(a.headers.get('X-Stationwizard-Diagnose')).toBe('CHECK_UNBEKANNT');
  });

  it('trägt die Schutzheader', async () => {
    const antwort = await verarbeite(db(), TOKEN);
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    expect(antwort.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(antwort.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('sperrt ohne Datenbank, statt abzustürzen', async () => {
    const antwort = await verarbeite(null, TOKEN);
    expect(antwort.status).toBe(503);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('CHECK_KONFIGURATION_FEHLT');
  });
});

describe('POST /api/oeffentlich/check/<TOKEN>', () => {
  it('nimmt eine Meldung als Einreichung an, nie als Check', async () => {
    const datenbank = db();
    const antwort = await sende(datenbank, meldung());
    expect(antwort.status).toBe(201);
    expect(datenbank.einreichungen).toHaveLength(1);
    expect(datenbank.einreichungen[0]?.status).toBe('offen');
    // Der entscheidende Punkt: in `materialchecks` steht dadurch nichts.
    expect(datenbank.checks).toHaveLength(0);
  });

  it('merkt sich den selbst angegebenen Namen als Selbstauskunft', async () => {
    const datenbank = db();
    await sende(datenbank, meldung({ name: '  A. Person  ' }));
    expect(datenbank.einreichungen[0]?.eingereicht_von_name).toBe('A. Person');
  });

  it('berechnet die Kennzahlen selbst und übernimmt keine aus dem Körper', async () => {
    const datenbank = db();
    await sende(datenbank, { ...meldung(), fehlmengen: 0, positionenGeprueft: 99 });
    expect(datenbank.einreichungen[0]?.fehlmengen).toBe(1);
    expect(datenbank.einreichungen[0]?.positionen_geprueft).toBe(1);
  });

  it('weist eine Meldung ohne Ursprung ab', async () => {
    const antwort = await verarbeite(db(), TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meldung()),
    });
    expect(antwort.status).toBe(403);
  });

  it('weist eine Meldung von fremder Origin ab', async () => {
    const antwort = await verarbeite(db(), TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://fremd.example' },
      body: JSON.stringify(meldung()),
    });
    expect(antwort.status).toBe(403);
  });

  it('weist eine Meldung mit fremdem Artikel ab, ohne etwas zu schreiben', async () => {
    const datenbank = db();
    const antwort = await sende(
      datenbank,
      meldung({
        positionen: [
          {
            artikelId: 'fremd',
            geprueft: true,
            istMenge: 1,
            unbrauchbar: false,
            verfallsdaten: [null],
          },
        ],
      }),
    );
    expect(antwort.status).toBe(400);
    expect(datenbank.einreichungen).toHaveLength(0);
  });

  it('verlangt einen Namen von mindestens zwei Zeichen', async () => {
    const datenbank = db();
    expect((await sende(datenbank, meldung({ name: 'A' }))).status).toBe(400);
    expect(datenbank.einreichungen).toHaveLength(0);
  });

  it('weist eine Meldung ohne eine einzige geprüfte Position ab', async () => {
    const datenbank = db();
    const antwort = await sende(
      datenbank,
      meldung({
        positionen: [
          {
            artikelId: ARTIKEL_ID,
            geprueft: false,
            istMenge: 2,
            unbrauchbar: false,
            verfallsdaten: [null, null],
          },
        ],
      }),
    );
    expect(antwort.status).toBe(400);
  });

  it('bremst, wenn für denselben Behälter zu viele Meldungen offen sind', async () => {
    const datenbank = db();
    for (let i = 0; i < 3; i += 1) {
      datenbank.einreichungen.push({
        id: `e${i}`,
        behaelter_id: 'b1',
        geprueft_am: '2026-01-01',
        positionen: '[]',
        positionen_gesamt: 1,
        positionen_geprueft: 1,
        fehlmengen: 0,
        unbrauchbar: 0,
        abgelaufen: 0,
        // Weit genug zurück, damit nicht das Wiederholfenster greift.
        eingereicht_am: '2020-01-01T00:00:00.000Z',
        eingereicht_von_name: 'A. Person',
        status: 'offen',
      });
    }
    const antwort = await sende(datenbank, meldung());
    expect(antwort.status).toBe(429);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('CHECK_ZU_VIELE_OFFEN');
    expect(antwort.headers.get('Retry-After')).toBe('3600');
  });

  it('bremst eine unmittelbar wiederholte Meldung desselben Behälters', async () => {
    const datenbank = db();
    expect((await sende(datenbank, meldung())).status).toBe(201);
    const zweite = await sende(datenbank, meldung());
    expect(zweite.status).toBe(429);
    expect(zweite.headers.get('X-Stationwizard-Diagnose')).toBe('CHECK_ZU_HAEUFIG');
  });

  it('verrät über ein falsches Token auch beim Schreiben nichts', async () => {
    const datenbank = db();
    const antwort = await sende(datenbank, meldung(), FALSCHES_TOKEN);
    expect(antwort.status).toBe(404);
    expect(datenbank.einreichungen).toHaveLength(0);
  });

  it('lehnt andere Methoden mit Allow-Kopf ab', async () => {
    const antwort = await verarbeite(db(), TOKEN, { method: 'DELETE' });
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET, HEAD, POST');
  });
});
