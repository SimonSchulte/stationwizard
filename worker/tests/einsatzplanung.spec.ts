import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verarbeiteEinsatzplanung } from '../src/einsatzplanung';
import { pruefeVbInhalt, pruefeVbVorlage, zaehleVb } from '../src/einsatzplanung-pruefung';
import { FakeEinsatzplanungDb } from './einsatzplanung-db-fake';

const EINSATZ_ID = '01234567-89ab-4cde-8fab-0123456789ab';
const ANDERER_EINSATZ_ID = '11234567-89ab-4cde-8fab-0123456789ab';
const VORLAGE_ID = '21234567-89ab-4cde-8fab-0123456789ab';
const IDENTITAET = { email: 'geprueft@example.test' };
const JSON_KOPF = { 'Content-Type': 'application/json' };

let zaehler = 0;
function neueId(): string {
  zaehler += 1;
  return `aaaaaaaa-0000-4000-8000-${String(zaehler).padStart(12, '0')}`;
}

function position(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: neueId(),
    herkunftId: null,
    anzahl: '2',
    material: 'Warnwesten',
    ...ueberschreibung,
  };
}
function laufzettel(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: neueId(),
    herkunftId: null,
    ueberschrift: 'Material verlasten',
    lagerort: 'Lager',
    transportMit: 'Rollwagen',
    auftraggeber: 'GF Betreuung',
    fachgruppe: 'betreuung',
    positionen: [position(), position({ anzahl: '', material: 'Ketchup' })],
    ...ueberschreibung,
  };
}
function abschnitt(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: neueId(),
    herkunftId: null,
    titel: 'GF Betreuung',
    farbe: 'abschnitt-1',
    fachgruppe: 'betreuung',
    laufzettel: [laufzettel(), laufzettel()],
    ...ueberschreibung,
  };
}
function inhalt(ueberschreibung: Record<string, unknown> = {}) {
  return { anweisungen: 'Bitte pünktlich.', abschnitte: [abschnitt()], ...ueberschreibung };
}
function einsatz(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: EINSATZ_ID,
    titel: 'Weihnachtsmarkt',
    beginn: '2026-12-05T14:00',
    ende: '2026-12-05T21:30',
    ort: 'Ummeln',
    hiorgVeranstaltungId: 'V-123',
    pepId: null,
    ...ueberschreibung,
  };
}
function vorbereitung(ueberschreibung: Record<string, unknown> = {}) {
  return { vorlageId: null, vorlageVersion: null, inhalt: inhalt(), ...ueberschreibung };
}
function vorlage(ueberschreibung: Record<string, unknown> = {}) {
  return { id: VORLAGE_ID, titel: 'Neue Vorlage', inhalt: inhalt(), ...ueberschreibung };
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
  kopf: Record<string, string>,
) {
  return verarbeiten(db, pfad, {
    method: methode,
    headers: { ...JSON_KOPF, ...kopf },
    body: JSON.stringify(koerper),
  });
}
const NEU = { 'If-None-Match': '*' };

const EINSAETZE = '/api/einsatzplanung/einsaetze';
const VORLAGEN = '/api/einsatzplanung/vb-vorlagen';
const VB = `${EINSAETZE}/${EINSATZ_ID}/vb`;

function legeEinsatzAn(db: FakeEinsatzplanungDb, koerper: unknown = einsatz()) {
  return senden(db, 'POST', EINSAETZE, koerper, NEU);
}

describe('Einsatzplanung: Verteiler', () => {
  it('antwortet ohne Datenbankbindung mit 503', async () => {
    const antwort = await verarbeiteEinsatzplanung(
      new Request('https://x.test/api/einsatzplanung/einsaetze'),
      {},
      IDENTITAET,
    );
    expect(antwort.status).toBe(503);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_KONFIGURATION_FEHLT',
    );
  });

  it.each([
    '/api/einsatzplanung',
    '/api/einsatzplanung/unbekannt',
    '/api/einsatzplanung/einsaetze/keine-uuid',
    `${EINSAETZE}/${EINSATZ_ID}/anderes`,
    `${EINSAETZE}?x=1`,
    `${VORLAGEN}/${VORLAGE_ID}?x=1`,
  ])('liefert für %s ein JSON-404', async (pfad) => {
    const antwort = await verarbeiten(new FakeEinsatzplanungDb(), pfad);
    expect(antwort.status).toBe(404);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_PFAD_UNGUELTIG');
  });

  it('lehnt nicht erlaubte Methoden mit 405 ab', async () => {
    const db = new FakeEinsatzplanungDb();
    expect((await verarbeiten(db, EINSAETZE, { method: 'DELETE' })).status).toBe(405);
    expect((await verarbeiten(db, `${EINSAETZE}/${EINSATZ_ID}`, { method: 'DELETE' })).status).toBe(
      405,
    );
    expect((await verarbeiten(db, VB, { method: 'POST' })).status).toBe(405);
  });
});

describe('Einsatzplanung: Einsätze', () => {
  it('legt an, liefert 201 mit ETag und liest wieder, ohne Version im Körper', async () => {
    const db = new FakeEinsatzplanungDb();
    const antwort = await legeEinsatzAn(db);
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
    expect(await antwort.json()).toEqual(einsatz());
    expect(db.einsaetze.get(EINSATZ_ID)).toMatchObject({
      angelegt_von: IDENTITAET.email,
      geaendert_von: IDENTITAET.email,
    });

    const gelesen = await verarbeiten(db, `${EINSAETZE}/${EINSATZ_ID}`);
    expect(gelesen.status).toBe(200);
    expect(gelesen.headers.get('ETag')).toBe('"1"');
    expect(await gelesen.json()).toEqual(einsatz());
  });

  it('nimmt keine Identität aus dem Körper', async () => {
    const db = new FakeEinsatzplanungDb();
    const antwort = await legeEinsatzAn(db, { ...einsatz(), angelegtVon: 'fremd@example.test' });
    expect(antwort.status).toBe(400);
    expect(db.einsaetze.size).toBe(0);
  });

  it('verlangt If-None-Match: * zum Anlegen und lehnt Kombinationen ab', async () => {
    const db = new FakeEinsatzplanungDb();
    expect((await senden(db, 'POST', EINSAETZE, einsatz(), {})).status).toBe(428);
    expect(
      (await senden(db, 'POST', EINSAETZE, einsatz(), { 'If-None-Match': '"1"' })).status,
    ).toBe(400);
    const beides = await senden(db, 'POST', EINSAETZE, einsatz(), {
      ...NEU,
      'If-Match': '"1"',
    });
    expect(beides.status).toBe(400);
    expect(db.einsaetze.size).toBe(0);
  });

  it('antwortet auf eine vorhandene Id mit 409 BEREITS_VORHANDEN', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    const antwort = await legeEinsatzAn(db, einsatz({ hiorgVeranstaltungId: null }));
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_BEREITS_VORHANDEN',
    );
  });

  it('weist ungültige Einsätze ab', async () => {
    const db = new FakeEinsatzplanungDb();
    for (const schlecht of [
      einsatz({ id: 'keine-uuid' }),
      einsatz({ titel: '  ' }),
      einsatz({ titel: 'x'.repeat(201) }),
      einsatz({ beginn: '2026-12-05 14:00' }),
      einsatz({ beginn: '2026-02-30T10:00' }),
      einsatz({ ende: '2026-12-05T24:00' }),
      einsatz({ hiorgVeranstaltungId: 'mit leerzeichen' }),
      einsatz({ pepId: 'keine-uuid' }),
      einsatz({ ort: 'o'.repeat(201) }),
      { ...einsatz(), zusatz: 1 },
      [],
    ]) {
      const antwort = await legeEinsatzAn(db, schlecht);
      expect(antwort.status).toBe(400);
      expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_UNGUELTIG');
    }
    expect(db.einsaetze.size).toBe(0);
  });

  it('beantwortet einen zu großen Körper mit 413', async () => {
    const antwort = await legeEinsatzAn(
      new FakeEinsatzplanungDb(),
      einsatz({ ort: 'o'.repeat(20000) }),
    );
    expect(antwort.status).toBe(413);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_ZU_GROSS');
  });

  it('weist ein doppeltes HiOrg-Veranstaltung mit 409 ab (Vorabprüfung)', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    const antwort = await legeEinsatzAn(db, einsatz({ id: ANDERER_EINSATZ_ID }));
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN',
    );
    expect(db.einsaetze.size).toBe(1);
  });

  it('übersetzt eine Indexverletzung aus einem Rennen in dieselbe Antwort', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    db.vorabpruefungUebergehen = true;
    const antwort = await legeEinsatzAn(db, einsatz({ id: ANDERER_EINSATZ_ID }));
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN',
    );
  });

  it('erlaubt mehrere Einsätze ohne HiOrg-Veranstaltung', async () => {
    const db = new FakeEinsatzplanungDb();
    expect((await legeEinsatzAn(db, einsatz({ hiorgVeranstaltungId: null }))).status).toBe(201);
    expect(
      (await legeEinsatzAn(db, einsatz({ id: ANDERER_EINSATZ_ID, hiorgVeranstaltungId: null })))
        .status,
    ).toBe(201);
  });

  it('antwortet auf einen unbekannten Einsatz mit 404', async () => {
    const antwort = await verarbeiten(new FakeEinsatzplanungDb(), `${EINSAETZE}/${EINSATZ_ID}`);
    expect(antwort.status).toBe(404);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_NICHT_GEFUNDEN');
  });

  describe('Änderung', () => {
    const pfad = `${EINSAETZE}/${EINSATZ_ID}`;

    it('speichert mit If-Match (stark und schwach) und erhöht die Version', async () => {
      const db = new FakeEinsatzplanungDb();
      await legeEinsatzAn(db);
      const stark = await senden(db, 'PUT', pfad, einsatz({ titel: 'Neu' }), { 'If-Match': '"1"' });
      expect(stark.status).toBe(200);
      expect(stark.headers.get('ETag')).toBe('"2"');
      expect(await stark.json()).toEqual(einsatz({ titel: 'Neu' }));
      const schwach = await senden(db, 'PUT', pfad, einsatz({ titel: 'Noch neuer' }), {
        'If-Match': 'W/"2"',
      });
      expect(schwach.status).toBe(200);
      expect(schwach.headers.get('ETag')).toBe('"3"');
      expect(db.einsaetze.get(EINSATZ_ID)?.titel).toBe('Noch neuer');
    });

    it('verlangt If-Match: 428 ohne, 400 unlesbar oder kombiniert, 412 veraltet', async () => {
      const db = new FakeEinsatzplanungDb();
      await legeEinsatzAn(db);
      expect((await senden(db, 'PUT', pfad, einsatz(), {})).status).toBe(428);
      expect((await senden(db, 'PUT', pfad, einsatz(), { 'If-Match': '*' })).status).toBe(400);
      expect((await senden(db, 'PUT', pfad, einsatz(), { 'If-Match': 'abc' })).status).toBe(400);
      expect((await senden(db, 'PUT', pfad, einsatz(), { 'If-Match': '"1"', ...NEU })).status).toBe(
        400,
      );
      const veraltet = await senden(db, 'PUT', pfad, einsatz({ titel: 'X' }), {
        'If-Match': '"7"',
      });
      expect(veraltet.status).toBe(412);
      expect(veraltet.headers.get('X-Stationwizard-Diagnose')).toBe(
        'EINSATZPLANUNG_VERSIONSKONFLIKT',
      );
      expect(db.einsaetze.get(EINSATZ_ID)?.titel).toBe('Weihnachtsmarkt');
    });

    it('lehnt eine abweichende Id im Körper ab und meldet 404 für Unbekanntes', async () => {
      const db = new FakeEinsatzplanungDb();
      await legeEinsatzAn(db);
      expect(
        (await senden(db, 'PUT', pfad, einsatz({ id: ANDERER_EINSATZ_ID }), { 'If-Match': '"1"' }))
          .status,
      ).toBe(400);
      const unbekannt = await senden(
        db,
        'PUT',
        `${EINSAETZE}/${ANDERER_EINSATZ_ID}`,
        einsatz({ id: ANDERER_EINSATZ_ID, hiorgVeranstaltungId: null }),
        { 'If-Match': '"1"' },
      );
      expect(unbekannt.status).toBe(404);
    });

    it('verhindert beim Ändern eine doppelte Veranstaltung, erlaubt aber die eigene', async () => {
      const db = new FakeEinsatzplanungDb();
      await legeEinsatzAn(db);
      await legeEinsatzAn(db, einsatz({ id: ANDERER_EINSATZ_ID, hiorgVeranstaltungId: 'V-9' }));
      const doppelt = await senden(
        db,
        'PUT',
        `${EINSAETZE}/${ANDERER_EINSATZ_ID}`,
        einsatz({ id: ANDERER_EINSATZ_ID, hiorgVeranstaltungId: 'V-123' }),
        { 'If-Match': '"1"' },
      );
      expect(doppelt.status).toBe(409);
      expect(doppelt.headers.get('X-Stationwizard-Diagnose')).toBe(
        'EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN',
      );
      db.vorabpruefungUebergehen = true;
      const rennen = await senden(
        db,
        'PUT',
        `${EINSAETZE}/${ANDERER_EINSATZ_ID}`,
        einsatz({ id: ANDERER_EINSATZ_ID, hiorgVeranstaltungId: 'V-123' }),
        { 'If-Match': '"1"' },
      );
      expect(rennen.status).toBe(409);
      db.vorabpruefungUebergehen = false;
      const eigene = await senden(db, 'PUT', pfad, einsatz({ titel: 'Gleiche Veranstaltung' }), {
        'If-Match': '"1"',
      });
      expect(eigene.status).toBe(200);
    });
  });

  it('listet Einsätze samt VB-Kennzahlen oder null mit einer einzigen Abfrage', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    await legeEinsatzAn(
      db,
      einsatz({ id: ANDERER_EINSATZ_ID, hiorgVeranstaltungId: null, beginn: null, ende: null }),
    );
    await senden(db, 'PUT', VB, vorbereitung(), NEU);

    const antwort = await verarbeiten(db, EINSAETZE);
    expect(antwort.status).toBe(200);
    const koerper = (await antwort.json()) as { einsaetze: Record<string, unknown>[] };
    expect(db.listenabfragen).toBe(1);
    expect(koerper.einsaetze).toEqual([
      { ...einsatz(), version: 1, vb: { laufzettel: 2, positionen: 4 } },
      {
        ...einsatz({
          id: ANDERER_EINSATZ_ID,
          hiorgVeranstaltungId: null,
          beginn: null,
          ende: null,
        }),
        version: 1,
        vb: null,
      },
    ]);
  });
});

describe('Einsatzplanung: Vorbereitung', () => {
  it('legt an, liest, ändert und löscht', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    const eingabe = vorbereitung({ vorlageId: VORLAGE_ID, vorlageVersion: 3 });

    const angelegt = await senden(db, 'PUT', VB, eingabe, NEU);
    expect(angelegt.status).toBe(201);
    expect(angelegt.headers.get('ETag')).toBe('"1"');
    expect(await angelegt.json()).toEqual(eingabe);
    expect(db.vorbereitungen.get(EINSATZ_ID)).toMatchObject({
      laufzettel: 2,
      positionen: 4,
      geaendert_von: IDENTITAET.email,
    });

    const gelesen = await verarbeiten(db, VB);
    expect(gelesen.status).toBe(200);
    expect(gelesen.headers.get('ETag')).toBe('"1"');
    expect(await gelesen.json()).toEqual(eingabe);

    const geaendert = vorbereitung({
      inhalt: inhalt({ abschnitte: [abschnitt({ laufzettel: [laufzettel()] })] }),
    });
    const aktualisiert = await senden(db, 'PUT', VB, geaendert, { 'If-Match': 'W/"1"' });
    expect(aktualisiert.status).toBe(200);
    expect(aktualisiert.headers.get('ETag')).toBe('"2"');
    expect(db.vorbereitungen.get(EINSATZ_ID)).toMatchObject({ laufzettel: 1, positionen: 2 });

    const veraltet = await senden(db, 'DELETE', VB, undefined, { 'If-Match': '"1"' });
    expect(veraltet.status).toBe(412);
    expect((await senden(db, 'DELETE', VB, undefined, {})).status).toBe(428);
    const geloescht = await verarbeiten(db, VB, {
      method: 'DELETE',
      headers: { 'If-Match': '"2"' },
    });
    expect(geloescht.status).toBe(204);
    const danach = await verarbeiten(db, VB);
    expect(danach.status).toBe(404);
    expect(danach.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_VB_NICHT_GEFUNDEN');
  });

  it('antwortet auf PUT für einen unbekannten Einsatz mit 404 NICHT_GEFUNDEN', async () => {
    const db = new FakeEinsatzplanungDb();
    const anlegen = await senden(db, 'PUT', VB, vorbereitung(), NEU);
    expect(anlegen.status).toBe(404);
    expect(anlegen.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_NICHT_GEFUNDEN');
    const aendern = await senden(db, 'PUT', VB, vorbereitung(), { 'If-Match': '"1"' });
    expect(aendern.status).toBe(404);
    expect(aendern.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_NICHT_GEFUNDEN');
  });

  it('unterscheidet bei vorhandenem Einsatz ohne VB 404 VB_NICHT_GEFUNDEN von 412', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    const antwort = await senden(db, 'PUT', VB, vorbereitung(), { 'If-Match': '"1"' });
    expect(antwort.status).toBe(404);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_VB_NICHT_GEFUNDEN',
    );
  });

  it('prüft die Vorbedingungen und meldet eine zweite Anlage als 409', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    expect((await senden(db, 'PUT', VB, vorbereitung(), {})).status).toBe(428);
    expect((await senden(db, 'PUT', VB, vorbereitung(), { 'If-Match': 'kaputt' })).status).toBe(
      400,
    );
    expect(
      (await senden(db, 'PUT', VB, vorbereitung(), { ...NEU, 'If-Match': '"1"' })).status,
    ).toBe(400);
    expect((await senden(db, 'PUT', VB, vorbereitung(), { 'If-None-Match': '"1"' })).status).toBe(
      400,
    );
    expect(db.vorbereitungen.size).toBe(0);
    await senden(db, 'PUT', VB, vorbereitung(), NEU);
    const doppelt = await senden(db, 'PUT', VB, vorbereitung(), NEU);
    expect(doppelt.status).toBe(409);
    expect(doppelt.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_BEREITS_VORHANDEN',
    );
  });

  it('weist ungültige Körper ab', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    for (const schlecht of [
      { ...vorbereitung(), zusatz: true },
      vorbereitung({ vorlageId: 'keine-uuid' }),
      vorbereitung({ vorlageVersion: 0 }),
      vorbereitung({ vorlageVersion: 1.5 }),
      vorbereitung({ inhalt: null }),
      vorbereitung({ inhalt: inhalt({ anweisungen: 'a'.repeat(6001) }) }),
    ]) {
      const antwort = await senden(db, 'PUT', VB, schlecht, NEU);
      expect(antwort.status).toBe(400);
      expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_UNGUELTIG');
    }
    expect(db.vorbereitungen.size).toBe(0);
  });
});

describe('Einsatzplanung: VB-Vorlagen', () => {
  it('legt an, liest, ändert, listet mit Kennzahlen und löscht', async () => {
    const db = new FakeEinsatzplanungDb();
    const eingabe = vorlage();
    const angelegt = await senden(db, 'POST', VORLAGEN, eingabe, NEU);
    expect(angelegt.status).toBe(201);
    expect(angelegt.headers.get('ETag')).toBe('"1"');
    expect(await angelegt.json()).toEqual(eingabe);

    const gelesen = await verarbeiten(db, `${VORLAGEN}/${VORLAGE_ID}`);
    expect(gelesen.headers.get('ETag')).toBe('"1"');
    expect(await gelesen.json()).toEqual(eingabe);

    const liste = await verarbeiten(db, VORLAGEN);
    const koerper = (await liste.json()) as { vorlagen: Record<string, unknown>[] };
    expect(koerper.vorlagen).toHaveLength(1);
    expect(koerper.vorlagen[0]).toMatchObject({
      id: VORLAGE_ID,
      titel: 'Neue Vorlage',
      version: 1,
      abschnitte: 1,
      laufzettel: 2,
      positionen: 4,
    });
    expect(koerper.vorlagen[0]).not.toHaveProperty('inhalt');
    expect(typeof koerper.vorlagen[0]?.['geaendertAm']).toBe('string');

    const geaendert = await senden(
      db,
      'PUT',
      `${VORLAGEN}/${VORLAGE_ID}`,
      vorlage({ titel: 'Anders' }),
      {
        'If-Match': 'W/"1"',
      },
    );
    expect(geaendert.status).toBe(200);
    expect(geaendert.headers.get('ETag')).toBe('"2"');

    expect((await senden(db, 'DELETE', `${VORLAGEN}/${VORLAGE_ID}`, undefined, {})).status).toBe(
      428,
    );
    const veraltet = await verarbeiten(db, `${VORLAGEN}/${VORLAGE_ID}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(veraltet.status).toBe(412);
    const geloescht = await verarbeiten(db, `${VORLAGEN}/${VORLAGE_ID}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"2"' },
    });
    expect(geloescht.status).toBe(204);
    const weg = await verarbeiten(db, `${VORLAGEN}/${VORLAGE_ID}`);
    expect(weg.status).toBe(404);
    expect(weg.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_VORLAGE_NICHT_GEFUNDEN',
    );
  });

  it('prüft Vorbedingungen, doppelte Ids und unbekannte Vorlagen', async () => {
    const db = new FakeEinsatzplanungDb();
    expect((await senden(db, 'POST', VORLAGEN, vorlage(), {})).status).toBe(428);
    await senden(db, 'POST', VORLAGEN, vorlage(), NEU);
    expect((await senden(db, 'POST', VORLAGEN, vorlage(), NEU)).status).toBe(409);
    const pfad = `${VORLAGEN}/${ANDERER_EINSATZ_ID}`;
    expect(
      (await senden(db, 'PUT', pfad, vorlage({ id: ANDERER_EINSATZ_ID }), { 'If-Match': '"1"' }))
        .status,
    ).toBe(404);
    expect((await senden(db, 'PUT', pfad, vorlage(), { 'If-Match': '"1"' })).status).toBe(400);
    expect((await senden(db, 'PUT', `${VORLAGEN}/${VORLAGE_ID}`, vorlage(), {})).status).toBe(428);
  });

  it('weist ungültige Vorlagen ab', async () => {
    const db = new FakeEinsatzplanungDb();
    for (const schlecht of [
      { ...vorlage(), zusatz: 1 },
      vorlage({ titel: '' }),
      vorlage({ titel: 't'.repeat(201) }),
      vorlage({ id: 'x' }),
    ]) {
      expect((await senden(db, 'POST', VORLAGEN, schlecht, NEU)).status).toBe(400);
    }
    expect(db.vorlagen.size).toBe(0);
  });
});

describe('Einsatzplanung: Prüfung des VB-Inhalts', () => {
  it('nimmt einen gültigen Inhalt unverändert an und zählt die Kennzahlen', () => {
    const wert = inhalt({ abschnitte: [abschnitt(), abschnitt()] });
    expect(pruefeVbInhalt(wert)).toEqual(wert);
    expect(zaehleVb(wert as never)).toEqual({ abschnitte: 2, laufzettel: 4, positionen: 8 });
  });

  it('lehnt unbekannte Felder auf jeder Ebene ab', () => {
    expect(pruefeVbInhalt({ ...inhalt(), x: 1 })).toBeNull();
    expect(pruefeVbInhalt(inhalt({ abschnitte: [{ ...abschnitt(), x: 1 }] }))).toBeNull();
    expect(
      pruefeVbInhalt(
        inhalt({ abschnitte: [abschnitt({ laufzettel: [{ ...laufzettel(), x: 1 }] })] }),
      ),
    ).toBeNull();
    expect(
      pruefeVbInhalt(
        inhalt({
          abschnitte: [
            abschnitt({ laufzettel: [laufzettel({ positionen: [{ ...position(), x: 1 }] })] }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('lehnt falsche Farben und Fachgruppen ab', () => {
    expect(
      pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ farbe: 'abschnitt-9' })] })),
    ).toBeNull();
    expect(pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ farbe: '#ff0000' })] }))).toBeNull();
    expect(
      pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ fachgruppe: 'technik' })] })),
    ).toBeNull();
    expect(
      pruefeVbInhalt(
        inhalt({ abschnitte: [abschnitt({ laufzettel: [laufzettel({ fachgruppe: 'x' })] })] }),
      ),
    ).toBeNull();
    expect(
      pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ fachgruppe: null })] })),
    ).not.toBeNull();
  });

  it('lehnt zu lange Texte und leere Pflichttexte ab', () => {
    const mitLaufzettel = (feld: Record<string, unknown>) =>
      inhalt({ abschnitte: [abschnitt({ laufzettel: [laufzettel(feld)] })] });
    expect(pruefeVbInhalt(mitLaufzettel({ lagerort: 'l'.repeat(201) }))).toBeNull();
    expect(pruefeVbInhalt(mitLaufzettel({ transportMit: 't'.repeat(201) }))).toBeNull();
    expect(pruefeVbInhalt(mitLaufzettel({ auftraggeber: 'a'.repeat(201) }))).toBeNull();
    expect(pruefeVbInhalt(mitLaufzettel({ ueberschrift: 'u'.repeat(201) }))).toBeNull();
    expect(pruefeVbInhalt(mitLaufzettel({ ueberschrift: '', lagerort: '' }))).not.toBeNull();
    expect(
      pruefeVbInhalt(mitLaufzettel({ positionen: [position({ anzahl: '1'.repeat(21) })] })),
    ).toBeNull();
    expect(pruefeVbInhalt(mitLaufzettel({ positionen: [position({ material: '' })] }))).toBeNull();
    expect(
      pruefeVbInhalt(mitLaufzettel({ positionen: [position({ material: 'm'.repeat(201) })] })),
    ).toBeNull();
    expect(pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ titel: '' })] }))).toBeNull();
  });

  it('lehnt doppelte Ids über alle Ebenen ab', () => {
    const gemeinsam = neueId();
    expect(
      pruefeVbInhalt(
        inhalt({ abschnitte: [abschnitt({ id: gemeinsam }), abschnitt({ id: gemeinsam })] }),
      ),
    ).toBeNull();
    expect(
      pruefeVbInhalt(
        inhalt({
          abschnitte: [
            abschnitt({
              laufzettel: [laufzettel({ id: gemeinsam }), laufzettel({ id: gemeinsam })],
            }),
          ],
        }),
      ),
    ).toBeNull();
    expect(
      pruefeVbInhalt(
        inhalt({
          abschnitte: [
            abschnitt({
              id: gemeinsam,
              laufzettel: [laufzettel({ positionen: [position({ id: gemeinsam })] })],
            }),
          ],
        }),
      ),
    ).toBeNull();
    expect(pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ id: 'keine-uuid' })] }))).toBeNull();
    expect(
      pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ herkunftId: 'keine-uuid' })] })),
    ).toBeNull();
  });

  it('erzwingt die Mengengrenzen', () => {
    const abschnitte = (n: number) =>
      Array.from({ length: n }, () => abschnitt({ laufzettel: [] }));
    expect(pruefeVbInhalt(inhalt({ abschnitte: abschnitte(30) }))).not.toBeNull();
    expect(pruefeVbInhalt(inhalt({ abschnitte: abschnitte(31) }))).toBeNull();

    const kurz = (n: number) => Array.from({ length: n }, () => laufzettel({ positionen: [] }));
    expect(
      pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ laufzettel: kurz(300) })] })),
    ).not.toBeNull();
    expect(
      pruefeVbInhalt(inhalt({ abschnitte: [abschnitt({ laufzettel: kurz(301) })] })),
    ).toBeNull();
    expect(
      pruefeVbInhalt(
        inhalt({
          abschnitte: [abschnitt({ laufzettel: kurz(150) }), abschnitt({ laufzettel: kurz(151) })],
        }),
      ),
    ).toBeNull();

    const positionen = (n: number) => Array.from({ length: n }, () => position());
    expect(
      pruefeVbInhalt(
        inhalt({
          abschnitte: [abschnitt({ laufzettel: [laufzettel({ positionen: positionen(50) })] })],
        }),
      ),
    ).not.toBeNull();
    expect(
      pruefeVbInhalt(
        inhalt({
          abschnitte: [abschnitt({ laufzettel: [laufzettel({ positionen: positionen(51) })] })],
        }),
      ),
    ).toBeNull();
  });
});

describe('Einsatzplanung: Startvorlage der Migration', () => {
  const quelle = JSON.parse(
    readFileSync(
      new URL('../../docs/vb-startvorlage-weihnachtsmarkt-ummeln.json', import.meta.url),
      'utf8',
    ),
  ) as { id: string; titel: string; inhalt: unknown };
  const sql = readFileSync(
    new URL('../migrations/einsatzplanung/0020_einsatzplanung.sql', import.meta.url),
    'utf8',
  );

  it('besteht die eigene Prüfung und hat die Kennzahlen 5/22/64', () => {
    const vorlageGeprueft = pruefeVbVorlage(quelle);
    expect(vorlageGeprueft).not.toBeNull();
    expect(zaehleVb(vorlageGeprueft!.inhalt)).toEqual({
      abschnitte: 5,
      laufzettel: 22,
      positionen: 64,
    });
  });

  it('steht inhaltsgleich als INSERT in der Migration', () => {
    const treffer =
      /VALUES\s*\('([^']+)', '([^']+)', '((?:[^']|'')*)', (\d+), (\d+), (\d+), 1,/.exec(sql);
    expect(treffer).not.toBeNull();
    const [, id, titel, jsonText, abschnitte, laufzettel, positionen] = treffer!;
    expect(id).toBe(quelle.id);
    expect(titel).toBe(quelle.titel);
    expect([abschnitte, laufzettel, positionen]).toEqual(['5', '22', '64']);
    expect(JSON.parse(jsonText!.replace(/''/g, "'"))).toEqual(quelle.inhalt);
  });

  it('lässt sich über die API lesen, wenn sie eingespielt ist', async () => {
    const db = new FakeEinsatzplanungDb();
    const geprueft = pruefeVbVorlage(quelle)!;
    const antwort = await senden(db, 'POST', VORLAGEN, geprueft, NEU);
    expect(antwort.status).toBe(201);
  });
});
