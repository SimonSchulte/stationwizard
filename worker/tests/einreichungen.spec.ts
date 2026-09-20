import { describe, expect, it } from 'vitest';
import { verarbeiteEinreichungen } from '../src/einreichungen';
import { FakeBenutzerDb } from './benutzer-db-fake';
import { FakeFahrzeugeDb } from './fahrzeug-db-fake';

const URSPRUNG = 'https://stationwizard.example.test';
const FAHRZEUG_SAN = '01234567-89ab-4cde-8fab-0123456789ab';
const FAHRZEUG_TESI = '01234567-89ab-4cde-8fab-0123456789ac';
const EINREICHUNG = '11111111-2222-4333-8444-555555555555';
const ZWEITE = '11111111-2222-4333-8444-555555555556';
const IDENTITAET = { email: 'fuehrung@example.test' };

function fahrzeug(db: FakeFahrzeugeDb, id: string, gruppe: string, bezeichnung: string) {
  db.fahrzeuge.set(id, {
    id,
    bezeichnung,
    funkrufname: 'Florian Testort 1/85/1',
    kennzeichen: 'XY-TE 123',
    fahrgestellnummer: null,
    eigentuemer: 'organisation',
    gruppe,
    bemerkung: '',
    wartungstermine: '[]',
    geaendert_am: '2026-09-01T10:00:00.000Z',
    geaendert_von: 'geprueft@example.test',
    version: 1,
    erfassung_token: 'a'.repeat(32),
    erfassung_token_am: '2026-09-01T10:00:00.000Z',
  });
}

function einreichung(
  db: FakeFahrzeugeDb,
  id: string,
  fahrzeugId: string,
  stand = 12_345,
  name = 'Maxi Muster',
) {
  db.einreichungen.push({
    id,
    fahrzeug_id: fahrzeugId,
    abgelesen_am: '2026-09-15',
    stand,
    eingereicht_am: '2026-09-15T08:00:00.000Z',
    eingereicht_von_name: name,
    bemerkung: 'Tank voll',
    status: 'offen',
    entschieden_am: null,
    entschieden_von: null,
    ablehnungsgrund: null,
    ablesung_id: null,
  });
}

function benutzer(rolle: string | null): FakeBenutzerDb {
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

function ruf(
  pfad: string,
  fahrzeugeDb: FakeFahrzeugeDb,
  rolle: string | null,
  init: RequestInit = {},
): Promise<Response> {
  return verarbeiteEinreichungen(
    new Request(`${URSPRUNG}${pfad}`, init),
    { FAHRZEUGE_DB: fahrzeugeDb as never, BENUTZER_DB: benutzer(rolle) as never },
    IDENTITAET,
  );
}

const POST: RequestInit = { method: 'POST' };

function ablehnung(grund: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grund }),
  };
}

describe('GET /api/fahrzeuge/einreichungen', () => {
  it('zeigt nur Meldungen der eigenen Freigabegruppen', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    fahrzeug(db, FAHRZEUG_TESI, 'tesi', 'GW-TeSi');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);
    einreichung(db, ZWEITE, FAHRZEUG_TESI);

    const liste = async (rolle: string | null) => {
      const antwort = await ruf('/api/fahrzeuge/einreichungen', db, rolle);
      expect(antwort.status).toBe(200);
      return (await antwort.json()) as { einreichungen: { id: string }[] };
    };

    expect((await liste('zugfuehrung')).einreichungen).toHaveLength(2);
    expect((await liste('gruppenfuehrung-sanitaet')).einreichungen.map((e) => e.id)).toEqual([
      EINREICHUNG,
    ]);
  });

  it('ist ohne passende Rolle leer statt abgewiesen', async () => {
    // "Offene Aufgaben" soll für jeden aufrufbar und dann ehrlich leer sein;
    // damit stimmt auch die Zahl in der Navigation ohne Zusatzlogik.
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);
    const antwort = await ruf('/api/fahrzeuge/einreichungen', db, 'helfer');
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ einreichungen: [] });
  });

  it('liefert den letzten gültigen Stand für den Plausibilitätshinweis mit', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    db.ablesungen.push(
      {
        id: 'alt',
        fahrzeug_id: FAHRZEUG_SAN,
        abgelesen_am: '2026-08-01',
        stand: 9_000,
        erfasst_am: '2026-08-01T10:00:00.000Z',
        erfasst_von: 'geprueft@example.test',
        quelle: 'formular',
        korrigiert: null,
        bemerkung: '',
      },
      {
        id: 'falsch',
        fahrzeug_id: FAHRZEUG_SAN,
        abgelesen_am: '2026-09-01',
        stand: 99_999,
        erfasst_am: '2026-09-01T10:00:00.000Z',
        erfasst_von: 'geprueft@example.test',
        quelle: 'formular',
        korrigiert: null,
        bemerkung: '',
      },
      {
        id: 'korrektur',
        fahrzeug_id: FAHRZEUG_SAN,
        abgelesen_am: '2026-09-02',
        stand: 10_000,
        erfasst_am: '2026-09-02T10:00:00.000Z',
        erfasst_von: 'geprueft@example.test',
        quelle: 'korrektur',
        korrigiert: 'falsch',
        bemerkung: '',
      },
    );
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);

    const antwort = await ruf('/api/fahrzeuge/einreichungen', db, 'zugfuehrung');
    const inhalt = (await antwort.json()) as {
      einreichungen: { letzterStand: number; gemeldetVonName: string; bezeichnung: string }[];
    };
    // Die korrigierte Ablesung zählt nicht als letzter Stand.
    expect(inhalt.einreichungen[0]?.letzterStand).toBe(10_000);
    expect(inhalt.einreichungen[0]?.gemeldetVonName).toBe('Maxi Muster');
    expect(inhalt.einreichungen[0]?.bezeichnung).toBe('RTW 1');
  });
});

describe('Freigabe', () => {
  it('erzeugt genau eine Ablesung mit geprüfter Identität und gemeldetem Namen', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);

    const antwort = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/freigabe`,
      db,
      'gruppenfuehrung-sanitaet',
      POST,
    );
    expect(antwort.status).toBe(200);

    expect(db.ablesungen).toHaveLength(1);
    expect(db.ablesungen[0]).toMatchObject({
      fahrzeug_id: FAHRZEUG_SAN,
      abgelesen_am: '2026-09-15',
      stand: 12_345,
      // Die freigebende Person trägt die Verantwortung für den Wert.
      erfasst_von: IDENTITAET.email,
      quelle: 'oeffentlich',
      korrigiert: null,
      gemeldet_von_name: 'Maxi Muster',
    });
    expect(db.einreichungen[0]).toMatchObject({
      status: 'freigegeben',
      entschieden_von: IDENTITAET.email,
      ablesung_id: db.ablesungen[0]?.id,
    });
  });

  it('protokolliert die Freigabe mit der geprüften Identität', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);
    await ruf(`/api/fahrzeuge/einreichungen/${EINREICHUNG}/freigabe`, db, 'zugfuehrung', POST);
    const eintrag = db.aenderungen.at(-1)!;
    expect(eintrag.von).toBe(IDENTITAET.email);
    expect(eintrag.beschreibung).toContain('Öffentliche Kilometermeldung freigegeben');
    expect(eintrag.beschreibung).toContain('12345 km');
    expect(eintrag.beschreibung).toContain('Maxi Muster');
    expect(eintrag.beschreibung).toContain('Selbstauskunft');
  });

  it('weist die Gruppenführung einer fremden Gruppe mit 403 ab', async () => {
    // Nicht nur unsichtbar: der Endpunkt selbst muss sperren.
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);

    for (const rolle of ['gruppenfuehrung-betreuung', 'helfer', null]) {
      const antwort = await ruf(
        `/api/fahrzeuge/einreichungen/${EINREICHUNG}/freigabe`,
        db,
        rolle,
        POST,
      );
      expect(antwort.status, String(rolle)).toBe(403);
      expect(await antwort.json()).toMatchObject({ code: 'FREIGABE_NICHT_ERLAUBT' });
    }
    expect(db.ablesungen).toHaveLength(0);
    expect(db.einreichungen[0]?.status).toBe('offen');
  });

  it('gibt eine bereits entschiedene Meldung nicht zweimal frei', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);

    const erste = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/freigabe`,
      db,
      'zugfuehrung',
      POST,
    );
    expect(erste.status).toBe(200);

    const zweite = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/freigabe`,
      db,
      'zugfuehrung',
      POST,
    );
    expect(zweite.status).toBe(409);
    expect(await zweite.json()).toMatchObject({ code: 'EINREICHUNG_NICHT_OFFEN' });
    // Der Wächter verhindert die zweite Ablesung.
    expect(db.ablesungen).toHaveLength(1);
  });

  it('meldet eine unbekannte Einreichung mit 404', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/freigabe`,
      db,
      'zugfuehrung',
      POST,
    );
    expect(antwort.status).toBe(404);
  });
});

describe('Ablehnung', () => {
  it('erzeugt keine Ablesung und hält den Grund fest', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);

    const antwort = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/ablehnung`,
      db,
      'zugfuehrung',
      ablehnung('Zahlendreher, bitte erneut melden'),
    );
    expect(antwort.status).toBe(200);
    expect(db.ablesungen).toHaveLength(0);
    expect(db.einreichungen[0]).toMatchObject({
      status: 'abgelehnt',
      entschieden_von: IDENTITAET.email,
      ablehnungsgrund: 'Zahlendreher, bitte erneut melden',
    });
    expect(db.aenderungen.at(-1)?.beschreibung).toContain('abgelehnt');
    expect(db.aenderungen.at(-1)?.beschreibung).toContain('Zahlendreher');
  });

  it('kommt ohne Grund aus und kürzt einen zu langen', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);
    einreichung(db, ZWEITE, FAHRZEUG_SAN);

    const ohne = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/ablehnung`,
      db,
      'zugfuehrung',
      ablehnung(undefined),
    );
    expect(ohne.status).toBe(200);
    expect(db.einreichungen[0]?.ablehnungsgrund).toBe('');

    const lang = await ruf(
      `/api/fahrzeuge/einreichungen/${ZWEITE}/ablehnung`,
      db,
      'zugfuehrung',
      ablehnung('x'.repeat(500)),
    );
    expect(lang.status).toBe(200);
    expect(db.einreichungen[1]?.ablehnungsgrund).toHaveLength(200);
  });

  it('weist einen Grund ab, der kein Text ist', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);
    const antwort = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/ablehnung`,
      db,
      'zugfuehrung',
      ablehnung(42),
    );
    expect(antwort.status).toBe(400);
    expect(db.einreichungen[0]?.status).toBe('offen');
  });

  it('prüft die Rolle auch beim Ablehnen', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, FAHRZEUG_SAN, 'sanitaet', 'RTW 1');
    einreichung(db, EINREICHUNG, FAHRZEUG_SAN);
    const antwort = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/ablehnung`,
      db,
      'gruppenfuehrung-tesi',
      ablehnung('nein'),
    );
    expect(antwort.status).toBe(403);
    expect(db.einreichungen[0]?.status).toBe('offen');
  });
});

describe('Methoden und Pfade', () => {
  it('erlaubt auf der Liste nur GET und auf den Entscheidungen nur POST', async () => {
    const db = new FakeFahrzeugeDb();
    const liste = await ruf('/api/fahrzeuge/einreichungen', db, 'zugfuehrung', POST);
    expect(liste.status).toBe(405);
    expect(liste.headers.get('Allow')).toBe('GET');

    const freigabe = await ruf(
      `/api/fahrzeuge/einreichungen/${EINREICHUNG}/freigabe`,
      db,
      'zugfuehrung',
    );
    expect(freigabe.status).toBe(405);
    expect(freigabe.headers.get('Allow')).toBe('POST');
  });

  it('kennt keine Query-Parameter', async () => {
    const db = new FakeFahrzeugeDb();
    const antwort = await ruf('/api/fahrzeuge/einreichungen?status=offen', db, 'zugfuehrung');
    expect(antwort.status).toBe(404);
  });
});
