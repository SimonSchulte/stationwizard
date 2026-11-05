import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verarbeiteEinsatzplanung } from '../src/einsatzplanung';
import {
  pruefePep,
  pruefePepInhalt,
  pruefePepVorlage,
  zaehlePep,
} from '../src/einsatzplanung-pep-pruefung';
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
    ...ueberschreibung,
  };
}
function vorbereitung(ueberschreibung: Record<string, unknown> = {}) {
  return { vorlageId: null, vorlageVersion: null, inhalt: inhalt(), ...ueberschreibung };
}
function vorlage(ueberschreibung: Record<string, unknown> = {}) {
  return { id: VORLAGE_ID, titel: 'Neue Vorlage', inhalt: inhalt(), ...ueberschreibung };
}

function pepPosition(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: neueId(),
    bezeichnung: 'Sanitäter',
    anforderungen: { taktisch: null, medizinisch: 'RS', zusatz: null },
    postenfuehrer: false,
    einsatzkraftId: null,
    ...ueberschreibung,
  };
}
function pepPosten(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: neueId(),
    bezeichnung: 'Bühne',
    fahrzeug: { funkruf: 'Florian 1', seriennummer: null, hiorgId: null },
    telefonnummer: null,
    hiorgSchichtId: null,
    positionen: [pepPosition(), pepPosition({ postenfuehrer: true })],
    ...ueberschreibung,
  };
}
function einsatzkraft(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: 'kraft-1',
    name: 'Muster Erika',
    taktisch: ['GF'],
    medizinisch: ['RS', 'NotSan'],
    zusatz: ['CE'],
    notiz: null,
    hiorgOrgId: null,
    telefonnummer: null,
    ...ueberschreibung,
  };
}
/** Zwei Posten, drei Positionen, davon eine besetzt, eine Einsatzkraft. */
function pepInhalt(ueberschreibung: Record<string, unknown> = {}) {
  return {
    beschreibung: 'Weihnachtsmarkt',
    posten: [
      pepPosten({ positionen: [pepPosition({ einsatzkraftId: 'kraft-1' }), pepPosition()] }),
      pepPosten({ fahrzeug: null, positionen: [pepPosition()] }),
    ],
    einsatzkraefte: [einsatzkraft()],
    einsatzleiterId: 'kraft-1',
    ...ueberschreibung,
  };
}
function pep(ueberschreibung: Record<string, unknown> = {}) {
  return { schema: 1, vorlageId: null, inhalt: pepInhalt(), ...ueberschreibung };
}
function pepVorlageInhalt(ueberschreibung: Record<string, unknown> = {}) {
  return {
    beschreibung: '',
    posten: [pepPosten(), pepPosten({ fahrzeug: null })],
    ...ueberschreibung,
  };
}
function pepVorlage(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: PEP_VORLAGE_ID,
    titel: 'Standard-PEP',
    inhalt: pepVorlageInhalt(),
    ...ueberschreibung,
  };
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
const PEP = `${EINSAETZE}/${EINSATZ_ID}/pep`;
const PEP_VORLAGEN = '/api/einsatzplanung/pep-vorlagen';
const PEP_VORLAGE_ID = '31234567-89ab-4cde-8fab-0123456789ab';

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
      { ...einsatz(), pepId: null },
      { ...einsatz(), pepId: '21234567-89ab-4cde-8fab-0123456789ab' },
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
      { ...einsatz(), version: 1, vb: { laufzettel: 2, positionen: 4 }, pep: null },
      {
        ...einsatz({
          id: ANDERER_EINSATZ_ID,
          hiorgVeranstaltungId: null,
          beginn: null,
          ende: null,
        }),
        version: 1,
        vb: null,
        pep: null,
      },
    ]);
  });

  it('liefert pep- und vb-Kennzahlen unabhängig voneinander in derselben Abfrage', async () => {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    await legeEinsatzAn(
      db,
      einsatz({ id: ANDERER_EINSATZ_ID, hiorgVeranstaltungId: null, beginn: null }),
    );
    await senden(db, 'PUT', PEP, pep(), NEU);
    await senden(db, 'PUT', `${EINSAETZE}/${ANDERER_EINSATZ_ID}/vb`, vorbereitung(), NEU);

    const koerper = (await (await verarbeiten(db, EINSAETZE)).json()) as {
      einsaetze: { id: string; vb: unknown; pep: unknown }[];
    };
    expect(db.listenabfragen).toBe(1);
    expect(koerper.einsaetze.find((e) => e.id === EINSATZ_ID)).toMatchObject({
      vb: null,
      pep: { posten: 2, positionen: 3, besetzt: 1 },
    });
    expect(koerper.einsaetze.find((e) => e.id === ANDERER_EINSATZ_ID)).toMatchObject({
      vb: { laufzettel: 2, positionen: 4 },
      pep: null,
    });
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

describe('Einsatzplanung: PEP eines Einsatzes', () => {
  async function mitEinsatz() {
    const db = new FakeEinsatzplanungDb();
    await legeEinsatzAn(db);
    return db;
  }

  it('legt an (201, ETag "1"), liest und setzt die Kennzahlen im Worker', async () => {
    const db = await mitEinsatz();
    const koerper = pep();
    const antwort = await senden(db, 'PUT', PEP, koerper, NEU);
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
    expect(await antwort.json()).toEqual(koerper);
    expect(db.peps.get(EINSATZ_ID)).toMatchObject({
      posten: 2,
      positionen: 3,
      besetzt: 1,
      einsatzkraefte: 1,
      schema: 1,
      geaendert_von: IDENTITAET.email,
    });
    const gelesen = await verarbeiten(db, PEP);
    expect(gelesen.status).toBe(200);
    expect(gelesen.headers.get('ETag')).toBe('"1"');
    expect(await gelesen.json()).toEqual(koerper);
  });

  it('antwortet ohne PEP mit 404 PEP_NICHT_GEFUNDEN, ohne Einsatz beim Anlegen mit NICHT_GEFUNDEN', async () => {
    const db = await mitEinsatz();
    const keine = await verarbeiten(db, PEP);
    expect(keine.status).toBe(404);
    expect(keine.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_PEP_NICHT_GEFUNDEN');
    const unbekannt = await senden(db, 'PUT', `${EINSAETZE}/${ANDERER_EINSATZ_ID}/pep`, pep(), NEU);
    expect(unbekannt.status).toBe(404);
    expect(unbekannt.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_NICHT_GEFUNDEN');
  });

  it('lehnt eine zweite Anlage mit 409 ab', async () => {
    const db = await mitEinsatz();
    await senden(db, 'PUT', PEP, pep(), NEU);
    const doppelt = await senden(db, 'PUT', PEP, pep(), NEU);
    expect(doppelt.status).toBe(409);
    expect(doppelt.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_BEREITS_VORHANDEN',
    );
  });

  it('verlangt Vorbedingungen: 428 ohne, 400 unlesbar oder kombiniert', async () => {
    const db = await mitEinsatz();
    expect((await senden(db, 'PUT', PEP, pep(), {})).status).toBe(428);
    expect((await senden(db, 'PUT', PEP, pep(), { 'If-None-Match': '"1"' })).status).toBe(400);
    expect((await senden(db, 'PUT', PEP, pep(), { ...NEU, 'If-Match': '"1"' })).status).toBe(400);
    await senden(db, 'PUT', PEP, pep(), NEU);
    expect((await senden(db, 'PUT', PEP, pep(), { 'If-Match': 'abc' })).status).toBe(400);
    expect((await senden(db, 'PUT', PEP, pep(), { 'If-Match': '*' })).status).toBe(400);
    expect((await verarbeiten(db, PEP, { method: 'DELETE' })).status).toBe(428);
  });

  it('ändert mit If-Match (stark und schwach), zählt neu und meldet 412 bei veraltetem Stand', async () => {
    const db = await mitEinsatz();
    await senden(db, 'PUT', PEP, pep(), NEU);
    const leer = pep({
      inhalt: pepInhalt({ posten: [], einsatzkraefte: [], einsatzleiterId: null }),
    });
    const stark = await senden(db, 'PUT', PEP, leer, { 'If-Match': '"1"' });
    expect(stark.status).toBe(200);
    expect(stark.headers.get('ETag')).toBe('"2"');
    expect(db.peps.get(EINSATZ_ID)).toMatchObject({ posten: 0, positionen: 0, besetzt: 0 });
    const schwach = await senden(db, 'PUT', PEP, pep(), { 'If-Match': 'W/"2"' });
    expect(schwach.status).toBe(200);
    expect(schwach.headers.get('ETag')).toBe('"3"');
    const veraltet = await senden(db, 'PUT', PEP, leer, { 'If-Match': '"1"' });
    expect(veraltet.status).toBe(412);
    expect(veraltet.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_VERSIONSKONFLIKT',
    );
    expect(db.peps.get(EINSATZ_ID)?.version).toBe(3);
  });

  it('meldet 404 beim Ändern und Löschen ohne PEP', async () => {
    const db = await mitEinsatz();
    expect((await senden(db, 'PUT', PEP, pep(), { 'If-Match': '"1"' })).status).toBe(404);
    expect(
      (await verarbeiten(db, PEP, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(404);
    const keinEinsatz = await verarbeiten(db, `${EINSAETZE}/${ANDERER_EINSATZ_ID}/pep`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(keinEinsatz.status).toBe(404);
    expect(keinEinsatz.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EINSATZPLANUNG_NICHT_GEFUNDEN',
    );
  });

  it('löscht mit If-Match (204) und meldet 412 bei veralteter Version', async () => {
    const db = await mitEinsatz();
    await senden(db, 'PUT', PEP, pep(), NEU);
    const veraltet = await verarbeiten(db, PEP, {
      method: 'DELETE',
      headers: { 'If-Match': '"9"' },
    });
    expect(veraltet.status).toBe(412);
    expect(db.peps.size).toBe(1);
    const geloescht = await verarbeiten(db, PEP, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"' },
    });
    expect(geloescht.status).toBe(204);
    expect(db.peps.size).toBe(0);
  });

  it('weist ungültige Körper mit 400 ab und beantwortet zu große mit 413', async () => {
    const db = await mitEinsatz();
    const antwort = await senden(db, 'PUT', PEP, { ...pep(), x: 1 }, NEU);
    expect(antwort.status).toBe(400);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('EINSATZPLANUNG_UNGUELTIG');
    const gross = await senden(db, 'PUT', PEP, pep({ vorlageId: 'x'.repeat(600_000) }), NEU);
    expect(gross.status).toBe(413);
    expect(db.peps.size).toBe(0);
  });

  it('lehnt nicht erlaubte Methoden mit 405 ab', async () => {
    const db = await mitEinsatz();
    expect((await verarbeiten(db, PEP, { method: 'POST' })).status).toBe(405);
    expect((await verarbeiten(db, PEP_VORLAGEN, { method: 'DELETE' })).status).toBe(405);
    expect(
      (await verarbeiten(db, `${PEP_VORLAGEN}/${PEP_VORLAGE_ID}`, { method: 'POST' })).status,
    ).toBe(405);
  });
});

describe('Einsatzplanung: PEP-Vorlagen', () => {
  const pfad = `${PEP_VORLAGEN}/${PEP_VORLAGE_ID}`;

  it('legt an, liest, listet mit Kennzahlen und ändert', async () => {
    const db = new FakeEinsatzplanungDb();
    const vorlageWert = pepVorlage();
    const angelegt = await senden(db, 'POST', PEP_VORLAGEN, vorlageWert, NEU);
    expect(angelegt.status).toBe(201);
    expect(angelegt.headers.get('ETag')).toBe('"1"');
    expect(db.pepVorlagen.get(PEP_VORLAGE_ID)).toMatchObject({ posten: 2, positionen: 4 });

    const gelesen = await verarbeiten(db, pfad);
    expect(gelesen.headers.get('ETag')).toBe('"1"');
    expect(await gelesen.json()).toEqual(vorlageWert);

    const liste = (await (await verarbeiten(db, PEP_VORLAGEN)).json()) as {
      vorlagen: Record<string, unknown>[];
    };
    expect(liste.vorlagen).toEqual([
      {
        id: PEP_VORLAGE_ID,
        titel: 'Standard-PEP',
        version: 1,
        posten: 2,
        positionen: 4,
        geaendertAm: expect.any(String),
      },
    ]);

    const geaendert = await senden(
      db,
      'PUT',
      pfad,
      { ...vorlageWert, titel: 'Neu' },
      {
        'If-Match': 'W/"1"',
      },
    );
    expect(geaendert.status).toBe(200);
    expect(geaendert.headers.get('ETag')).toBe('"2"');
    expect(db.pepVorlagen.get(PEP_VORLAGE_ID)?.titel).toBe('Neu');
  });

  it('verlangt If-None-Match: * beim Anlegen und meldet 409 bei vorhandener Id', async () => {
    const db = new FakeEinsatzplanungDb();
    expect((await senden(db, 'POST', PEP_VORLAGEN, pepVorlage(), {})).status).toBe(428);
    expect(
      (await senden(db, 'POST', PEP_VORLAGEN, pepVorlage(), { 'If-None-Match': 'x' })).status,
    ).toBe(400);
    await senden(db, 'POST', PEP_VORLAGEN, pepVorlage(), NEU);
    expect((await senden(db, 'POST', PEP_VORLAGEN, pepVorlage(), NEU)).status).toBe(409);
  });

  it('antwortet 428/400/412/404 beim Ändern und Löschen', async () => {
    const db = new FakeEinsatzplanungDb();
    expect((await verarbeiten(db, pfad)).status).toBe(404);
    expect((await senden(db, 'PUT', pfad, pepVorlage(), { 'If-Match': '"1"' })).status).toBe(404);
    await senden(db, 'POST', PEP_VORLAGEN, pepVorlage(), NEU);
    expect((await senden(db, 'PUT', pfad, pepVorlage(), {})).status).toBe(428);
    expect((await senden(db, 'PUT', pfad, pepVorlage(), { 'If-Match': 'abc' })).status).toBe(400);
    expect((await senden(db, 'PUT', pfad, pepVorlage(), { 'If-Match': '"5"' })).status).toBe(412);
    expect(
      (
        await senden(db, 'PUT', pfad, pepVorlage({ id: '41234567-89ab-4cde-8fab-0123456789ab' }), {
          'If-Match': '"1"',
        })
      ).status,
    ).toBe(400);
    expect((await verarbeiten(db, pfad, { method: 'DELETE' })).status).toBe(428);
    expect(
      (await verarbeiten(db, pfad, { method: 'DELETE', headers: { 'If-Match': '"5"' } })).status,
    ).toBe(412);
    expect(
      (await verarbeiten(db, pfad, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(204);
    expect(
      (await verarbeiten(db, pfad, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status,
    ).toBe(404);
  });

  it('lehnt eine Vorlage mit Zuordnung oder Einsatzkräften ab', async () => {
    const db = new FakeEinsatzplanungDb();
    const mitZuordnung = pepVorlage({
      inhalt: pepVorlageInhalt({
        posten: [pepPosten({ positionen: [pepPosition({ einsatzkraftId: 'kraft-1' })] })],
      }),
    });
    expect((await senden(db, 'POST', PEP_VORLAGEN, mitZuordnung, NEU)).status).toBe(400);
    const mitKraeften = pepVorlage({
      inhalt: { ...pepVorlageInhalt(), einsatzkraefte: [einsatzkraft()] },
    });
    expect((await senden(db, 'POST', PEP_VORLAGEN, mitKraeften, NEU)).status).toBe(400);
    expect(db.pepVorlagen.size).toBe(0);
  });
});

describe('Einsatzplanung: Prüfung der PEP', () => {
  it('nimmt eine gültige PEP unverändert an und zählt die Kennzahlen', () => {
    const wert = pep();
    expect(pruefePep(wert)).toEqual(wert);
    expect(zaehlePep(wert.inhalt as never)).toEqual({
      posten: 2,
      positionen: 3,
      besetzt: 1,
      einsatzkraefte: 1,
    });
    const vorlageWert = pepVorlage();
    expect(pruefePepVorlage(vorlageWert)).toEqual(vorlageWert);
  });

  it('lehnt unbekannte Felder auf jeder Ebene ab', () => {
    const mit = (f: (i: ReturnType<typeof pepInhalt>) => unknown) =>
      pruefePepInhalt(f(pepInhalt()));
    expect(pruefePep({ ...pep(), x: 1 })).toBeNull();
    expect(pruefePepInhalt({ ...pepInhalt(), x: 1 })).toBeNull();
    expect(mit((i) => ({ ...i, posten: [{ ...i.posten[0], x: 1 }] }))).toBeNull();
    expect(
      mit((i) => ({
        ...i,
        posten: [{ ...i.posten[0], positionen: [{ ...i.posten[0]!.positionen[0], x: 1 }] }],
      })),
    ).toBeNull();
    expect(
      mit((i) => ({
        ...i,
        posten: [
          {
            ...i.posten[0],
            positionen: [
              {
                ...i.posten[0]!.positionen[0],
                anforderungen: { taktisch: null, medizinisch: null, zusatz: null, x: 1 },
              },
            ],
          },
        ],
      })),
    ).toBeNull();
    expect(
      mit((i) => ({
        ...i,
        posten: [
          { ...i.posten[0], fahrzeug: { funkruf: 'a', seriennummer: null, hiorgId: null, x: 1 } },
        ],
      })),
    ).toBeNull();
    expect(mit((i) => ({ ...i, einsatzkraefte: [{ ...i.einsatzkraefte[0], x: 1 }] }))).toBeNull();
  });

  it('verlangt Schema 1', () => {
    expect(pruefePep(pep({ schema: 2 }))).toBeNull();
    expect(pruefePep(pep({ schema: undefined }))).toBeNull();
  });

  it('lehnt Verweise auf fehlende Einsatzkräfte ab', () => {
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: [pepPosten({ positionen: [pepPosition({ einsatzkraftId: 'fremd' })] })],
        }),
      ),
    ).toBeNull();
    expect(pruefePepInhalt(pepInhalt({ einsatzleiterId: 'fremd' }))).toBeNull();
    expect(pruefePepInhalt(pepInhalt({ einsatzkraefte: [], einsatzleiterId: null }))).toBeNull();
    expect(
      pruefePepInhalt(pepInhalt({ einsatzkraefte: [], einsatzleiterId: null, posten: [] })),
    ).not.toBeNull();
  });

  it('lehnt doppelte Ids je Art ab, erlaubt aber gleiche Ids verschiedener Arten', () => {
    const p = pepPosten({ id: 'gleich', positionen: [] });
    expect(pruefePepInhalt(pepInhalt({ posten: [p, { ...p }] }))).toBeNull();
    const doppeltePosition = pepPosition({ id: 'pos' });
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: [
            pepPosten({ positionen: [doppeltePosition] }),
            pepPosten({ positionen: [{ ...doppeltePosition }] }),
          ],
        }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({ einsatzkraefte: [einsatzkraft(), einsatzkraft({ name: 'Zweite' })] }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: [pepPosten({ id: 'kraft-1', positionen: [pepPosition({ id: 'kraft-1' })] })],
          einsatzkraefte: [einsatzkraft()],
          einsatzleiterId: null,
        }),
      ),
    ).not.toBeNull();
  });

  it('prüft Taktisch- und Medizinisch-Werte gegen die bestehenden Rangfolgen', () => {
    const mitAnforderung = (anforderungen: Record<string, unknown>) =>
      pruefePepInhalt(
        pepInhalt({
          posten: [pepPosten({ positionen: [pepPosition({ anforderungen })] })],
          einsatzkraefte: [],
          einsatzleiterId: null,
        }),
      );
    for (const taktisch of ['H', 'KSH', 'GF', 'ZF', 'GdSA', 'VF']) {
      expect(mitAnforderung({ taktisch, medizinisch: null, zusatz: null })).not.toBeNull();
    }
    for (const medizinisch of ['EH', 'SSD', 'SanH', 'RH', 'RS', 'RA', 'NotSan', 'A', 'NA']) {
      expect(mitAnforderung({ taktisch: null, medizinisch, zusatz: null })).not.toBeNull();
    }
    expect(mitAnforderung({ taktisch: 'ZZ', medizinisch: null, zusatz: null })).toBeNull();
    expect(mitAnforderung({ taktisch: 'gf', medizinisch: null, zusatz: null })).toBeNull();
    expect(mitAnforderung({ taktisch: null, medizinisch: 'Arzt', zusatz: null })).toBeNull();
    expect(mitAnforderung({ taktisch: null, medizinisch: 'RS' })).toBeNull();
    expect(
      pruefePepInhalt(pepInhalt({ einsatzkraefte: [einsatzkraft({ taktisch: ['X'] })] })),
    ).toBeNull();
    expect(
      pruefePepInhalt(pepInhalt({ einsatzkraefte: [einsatzkraft({ medizinisch: ['Arzt'] })] })),
    ).toBeNull();
  });

  it('begrenzt Mengen und Längen', () => {
    expect(pruefePepInhalt(pepInhalt({ beschreibung: 'x'.repeat(2001) }))).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: Array.from({ length: 101 }, () => pepPosten({ positionen: [] })),
          einsatzkraefte: [],
          einsatzleiterId: null,
        }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: [pepPosten({ positionen: Array.from({ length: 51 }, () => pepPosition()) })],
          einsatzkraefte: [],
          einsatzleiterId: null,
        }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: [],
          einsatzleiterId: null,
          einsatzkraefte: Array.from({ length: 501 }, () => einsatzkraft({ id: neueId() })),
        }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({
          einsatzkraefte: [einsatzkraft({ id: 'x'.repeat(65) })],
          einsatzleiterId: null,
        }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(pepInhalt({ einsatzkraefte: [einsatzkraft({ name: ' ' })] })),
    ).toBeNull();
    expect(
      pruefePepInhalt(pepInhalt({ einsatzkraefte: [einsatzkraft({ notiz: 'n'.repeat(501) })] })),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({ einsatzkraefte: [einsatzkraft({ zusatz: Array(31).fill('a') })] }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: [pepPosten({ bezeichnung: '' })],
          einsatzkraefte: [],
          einsatzleiterId: null,
        }),
      ),
    ).toBeNull();
    expect(
      pruefePepInhalt(
        pepInhalt({
          posten: [pepPosten({ telefonnummer: '1'.repeat(51) })],
          einsatzkraefte: [],
          einsatzleiterId: null,
        }),
      ),
    ).toBeNull();
  });

  it('erlaubt in der Vorlage Fahrzeug, Schicht und Telefonnummer, aber keine Zuordnung', () => {
    const vorgabe = pepPosten({ telefonnummer: '0521 1', hiorgSchichtId: 'S-1' });
    expect(pruefePepVorlageInhalt_(vorgabe)).not.toBeNull();
    expect(
      pruefePepVorlage(
        pepVorlage({
          inhalt: pepVorlageInhalt({
            posten: [pepPosten({ positionen: [pepPosition({ einsatzkraftId: 'k' })] })],
          }),
        }),
      ),
    ).toBeNull();
  });
});

function pruefePepVorlageInhalt_(posten: unknown) {
  return pruefePepVorlage(pepVorlage({ inhalt: pepVorlageInhalt({ posten: [posten] }) }));
}
