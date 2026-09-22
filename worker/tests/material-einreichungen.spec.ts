import { describe, expect, it } from 'vitest';
import { verarbeiteMaterialEinreichungen } from '../src/material-einreichungen';
import { FakeBenutzerDb } from './benutzer-db-fake';
import { FakeMaterialDb } from './material-db-fake';

const IDENTITAET = { email: 'fuehrung@example.test' };
const EINREICHUNG = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
const ZWEITE = '66666666-8888-4999-8aaa-bbbbbbbbbbbb';

function anfrage(pfad: string, init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

function benutzer(rolle: string | null): FakeBenutzerDb {
  const db = new FakeBenutzerDb();
  if (rolle !== null) {
    db.benutzer.set(IDENTITAET.email, {
      email: IDENTITAET.email,
      rolle,
      sonderrollen: '[]',
      erster_zugriff_am: '2026-01-01T00:00:00.000Z',
      letzter_zugriff_am: '2026-01-01T00:00:00.000Z',
      rolle_geaendert_am: null,
      rolle_geaendert_von: null,
    });
  }
  return db;
}

function material(gruppe = 'sanitaet'): FakeMaterialDb {
  const db = new FakeMaterialDb();
  db.fahrzeuge.set('f1', {
    id: 'f1',
    bezeichnung: 'GW SAN Übung',
    funkrufname: 'Florian Testort 1/59/1',
    gruppe,
  });
  db.behaelter.set('b1', {
    id: 'b1',
    fahrzeug_id: 'f1',
    vorlage_id: 'v1',
    bezeichnung: 'NFR 3',
    bemerkung: '',
    check_token: 'a'.repeat(32),
    check_token_am: '2026-01-01T00:00:00.000Z',
    geaendert_am: '2026-01-01T00:00:00.000Z',
    geaendert_von: 'test@example.test',
    version: 1,
  });
  return db;
}

function einreichung(db: FakeMaterialDb, id = EINREICHUNG): void {
  db.einreichungen.push({
    id,
    behaelter_id: 'b1',
    geprueft_am: '2026-09-20',
    positionen: JSON.stringify([{ artikelId: 'a1', bezeichnung: 'Erfundene Binde' }]),
    positionen_gesamt: 1,
    positionen_geprueft: 1,
    fehlmengen: 1,
    unbrauchbar: 0,
    abgelaufen: 0,
    eingereicht_am: '2026-09-20T10:00:00.000Z',
    eingereicht_von_name: 'A. Person',
    status: 'offen',
    vorlage_id: 'v1',
    vorlage_version: 1,
    vorlage_bezeichnung: 'Erfundene Prüfvorlage',
    grundlage: 'Erfundene Grundlage',
    verfallsdatum_erfasst: 1,
    bemerkung: '',
  });
}

function verarbeite(
  db: FakeMaterialDb,
  benutzerDb: FakeBenutzerDb,
  pfad: string,
  init?: RequestInit,
) {
  return verarbeiteMaterialEinreichungen(
    anfrage(pfad, init),
    { FAHRZEUGE_DB: db as never, BENUTZER_DB: benutzerDb as never },
    IDENTITAET,
  );
}

function freigabe(db: FakeMaterialDb, benutzerDb: FakeBenutzerDb, ids: string[]) {
  return verarbeite(db, benutzerDb, '/api/material/einreichungen/freigabe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

describe('GET /api/material/einreichungen', () => {
  it('zeigt der Zugführung offene Meldungen aller Gruppen', async () => {
    const db = material();
    einreichung(db);
    const antwort = await verarbeite(db, benutzer('zugfuehrung'), '/api/material/einreichungen');
    const inhalt = (await antwort.json()) as { einreichungen: unknown[] };
    expect(inhalt.einreichungen).toHaveLength(1);
  });

  it('zeigt der Gruppenführung nur ihre eigene Gruppe', async () => {
    const db = material('betreuung');
    einreichung(db);
    const antwort = await verarbeite(
      db,
      benutzer('gruppenfuehrung-sanitaet'),
      '/api/material/einreichungen',
    );
    const inhalt = (await antwort.json()) as { einreichungen: unknown[] };
    expect(inhalt.einreichungen).toHaveLength(0);
  });

  it('liefert ohne Rolle eine leere Liste statt eines Fehlers', async () => {
    const db = material();
    einreichung(db);
    const antwort = await verarbeite(db, benutzer(null), '/api/material/einreichungen');
    expect(antwort.status).toBe(200);
    expect(((await antwort.json()) as { einreichungen: unknown[] }).einreichungen).toHaveLength(0);
  });

  it('führt in der Liste keine Positionen, im Einzelabruf schon', async () => {
    const db = material();
    einreichung(db);
    const liste = (await (
      await verarbeite(db, benutzer('zugfuehrung'), '/api/material/einreichungen')
    ).json()) as { einreichungen: Record<string, unknown>[] };
    expect(liste.einreichungen[0]?.['positionen']).toBeUndefined();

    const einzeln = (await (
      await verarbeite(db, benutzer('zugfuehrung'), `/api/material/einreichungen/${EINREICHUNG}`)
    ).json()) as { positionen: unknown[] };
    expect(einzeln.positionen).toHaveLength(1);
  });
});

describe('POST /api/material/einreichungen/freigabe', () => {
  it('macht aus einer Meldung einen Check mit der freigebenden Identität', async () => {
    const db = material();
    einreichung(db);
    const antwort = await freigabe(db, benutzer('zugfuehrung'), [EINREICHUNG]);
    expect(antwort.status).toBe(200);

    expect(db.checks).toHaveLength(1);
    const check = db.checks[0];
    expect(check?.erfasst_von).toBe(IDENTITAET.email);
    // Der selbst angegebene Name steht daneben, nicht in erfasst_von.
    expect(check?.gemeldet_von_name).toBe('A. Person');
    expect(check?.quelle).toBe('oeffentlich');
    expect(db.einreichungen[0]?.status).toBe('freigegeben');
  });

  it('gibt mehrere Meldungen in einem Aufruf frei', async () => {
    const db = material();
    einreichung(db, EINREICHUNG);
    einreichung(db, ZWEITE);
    const antwort = await freigabe(db, benutzer('zugfuehrung'), [EINREICHUNG, ZWEITE]);
    const inhalt = (await antwort.json()) as { ergebnisse: { status: string }[] };
    expect(inhalt.ergebnisse.map((e) => e.status)).toEqual(['freigegeben', 'freigegeben']);
    expect(db.checks).toHaveLength(2);
  });

  it('lässt einen Fehlschlag die übrigen Freigaben nicht blockieren', async () => {
    const db = material();
    einreichung(db, EINREICHUNG);
    const antwort = await freigabe(db, benutzer('zugfuehrung'), [
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      EINREICHUNG,
    ]);
    const inhalt = (await antwort.json()) as { ergebnisse: { status: string }[] };
    expect(inhalt.ergebnisse.map((e) => e.status)).toEqual(['nicht-gefunden', 'freigegeben']);
    expect(db.checks).toHaveLength(1);
  });

  it('erzeugt aus einer bereits entschiedenen Meldung keinen zweiten Check', async () => {
    const db = material();
    einreichung(db);
    await freigabe(db, benutzer('zugfuehrung'), [EINREICHUNG]);
    const erneut = await freigabe(db, benutzer('zugfuehrung'), [EINREICHUNG]);
    const inhalt = (await erneut.json()) as { ergebnisse: { status: string }[] };
    expect(inhalt.ergebnisse[0]?.status).toBe('nicht-offen');
    expect(db.checks).toHaveLength(1);
  });

  it('verweigert die Freigabe der Gruppenführung einer fremden Gruppe', async () => {
    const db = material('betreuung');
    einreichung(db);
    const antwort = await freigabe(db, benutzer('gruppenfuehrung-sanitaet'), [EINREICHUNG]);
    const inhalt = (await antwort.json()) as { ergebnisse: { status: string }[] };
    expect(inhalt.ergebnisse[0]?.status).toBe('nicht-erlaubt');
    expect(db.checks).toHaveLength(0);
    expect(db.einreichungen[0]?.status).toBe('offen');
  });

  it('verweigert die Freigabe einem Helfer', async () => {
    const db = material();
    einreichung(db);
    const antwort = await freigabe(db, benutzer('helfer'), [EINREICHUNG]);
    const inhalt = (await antwort.json()) as { ergebnisse: { status: string }[] };
    expect(inhalt.ergebnisse[0]?.status).toBe('nicht-erlaubt');
    expect(db.checks).toHaveLength(0);
  });

  it('weist eine zu große Auswahl ab', async () => {
    const db = material();
    const ids = Array.from(
      { length: 51 },
      (_, i) => `77777777-8888-4999-8aaa-${String(i).padStart(12, '0')}`,
    );
    const antwort = await freigabe(db, benutzer('zugfuehrung'), ids);
    expect(antwort.status).toBe(400);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_STAPEL_ZU_GROSS');
  });

  it('weist eine leere Auswahl ab', async () => {
    const antwort = await freigabe(material(), benutzer('zugfuehrung'), []);
    expect(antwort.status).toBe(400);
  });
});

describe('POST /api/material/einreichungen/<UUID>/ablehnung', () => {
  function ablehnen(db: FakeMaterialDb, benutzerDb: FakeBenutzerDb, grund: unknown) {
    return verarbeite(db, benutzerDb, `/api/material/einreichungen/${EINREICHUNG}/ablehnung`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grund }),
    });
  }

  it('verwirft die Meldung mit Grund, ohne einen Check anzulegen', async () => {
    const db = material();
    einreichung(db);
    const antwort = await ablehnen(db, benutzer('zugfuehrung'), 'Zahlen unplausibel');
    expect(antwort.status).toBe(200);
    expect(db.einreichungen[0]?.status).toBe('abgelehnt');
    expect(db.einreichungen[0]?.ablehnungsgrund).toBe('Zahlen unplausibel');
    expect(db.checks).toHaveLength(0);
  });

  it('verlangt einen Grund', async () => {
    const db = material();
    einreichung(db);
    expect((await ablehnen(db, benutzer('zugfuehrung'), '   ')).status).toBe(400);
    expect(db.einreichungen[0]?.status).toBe('offen');
  });

  it('verweigert die Ablehnung ohne Freigaberecht', async () => {
    const db = material();
    einreichung(db);
    const antwort = await ablehnen(db, benutzer('helfer'), 'egal');
    expect(antwort.status).toBe(403);
    expect(db.einreichungen[0]?.status).toBe('offen');
  });

  it('meldet eine bereits entschiedene Meldung als Konflikt', async () => {
    const db = material();
    einreichung(db);
    await ablehnen(db, benutzer('zugfuehrung'), 'Erster Grund');
    const erneut = await ablehnen(db, benutzer('zugfuehrung'), 'Zweiter Grund');
    expect(erneut.status).toBe(409);
    expect(db.einreichungen[0]?.ablehnungsgrund).toBe('Erster Grund');
  });
});
