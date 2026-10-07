import { describe, expect, it } from 'vitest';
import { personSchluessel, verarbeiteEhrungen } from '../src/ehrungen';
import { leseMitgliedSeit } from '../src/hiorg-api';
import { FakeEhrungenDb } from './ehrungen-db-fake';

const IDENTITAET = { email: 'geprueft@example.test' };

function umgebung(db: FakeEhrungenDb) {
  return { BENUTZER_DB: db as unknown as D1Database };
}

function anfrage(
  pfad: string,
  methode = 'GET',
  koerper?: unknown,
  kopf: HeadersInit = {},
): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...kopf },
    body: koerper === undefined ? undefined : JSON.stringify(koerper),
  });
}

async function importiere(
  db: FakeEhrungenDb,
  eintraege: unknown[],
  anlegen = true,
): Promise<{ status: number; ergebnisse?: string[] }> {
  const antwort = await verarbeiteEhrungen(
    anfrage('/api/personal/ehrungen/import', 'POST', { anlegen, eintraege }),
    umgebung(db),
    IDENTITAET,
  );
  const inhalt = (await antwort.json()) as { ergebnisse?: string[] };
  return { status: antwort.status, ergebnisse: inhalt.ergebnisse };
}

async function liste(db: FakeEhrungenDb) {
  const antwort = await verarbeiteEhrungen(
    anfrage('/api/personal/ehrungen'),
    umgebung(db),
    IDENTITAET,
  );
  return ((await antwort.json()) as { personen: Record<string, unknown>[] }).personen;
}

describe('Ehrungen: Stundenimport', () => {
  it('legt neue Personen an und aktualisiert vorhandene über den Namen', async () => {
    const db = new FakeEhrungenDb();
    expect(
      (await importiere(db, [{ nachname: 'Muster', vorname: 'Max', stunden: 1500.5 }])).ergebnisse,
    ).toEqual(['angelegt']);
    const [person] = await liste(db);
    expect(person).toMatchObject({
      nachname: 'Muster',
      stunden: 1500.5,
      version: 1,
      geaendertVon: IDENTITAET.email,
    });

    const zweiter = await importiere(db, [
      { nachname: ' MUSTER', vorname: 'max', stunden: 1600, version: 1 },
    ]);
    expect(zweiter.ergebnisse).toEqual(['aktualisiert']);
    const nachher = await liste(db);
    expect(nachher).toHaveLength(1);
    expect(nachher[0]).toMatchObject({ stunden: 1600, version: 2, nachname: 'Muster' });
  });

  it('schreibt nichts, wenn sich nichts ändert', async () => {
    const db = new FakeEhrungenDb();
    await importiere(db, [{ nachname: 'Muster', vorname: 'Max', stunden: 10 }]);
    const aufrufe = db.batchAufrufe;
    const ergebnis = await importiere(db, [{ nachname: 'Muster', vorname: 'Max', stunden: 10 }]);
    expect(ergebnis.ergebnisse).toEqual(['unveraendert']);
    expect(db.batchAufrufe).toBe(aufrufe);
  });

  it('überschreibt keine vorhandene Person ohne die bekannte Version', async () => {
    const db = new FakeEhrungenDb();
    await importiere(db, [{ nachname: 'Muster', vorname: 'Max', stunden: 10 }]);
    const ohne = await importiere(db, [{ nachname: 'Muster', vorname: 'Max', stunden: 20 }]);
    expect(ohne.ergebnisse).toEqual(['konflikt']);
    const veraltet = await importiere(db, [
      { nachname: 'Muster', vorname: 'Max', stunden: 20, version: 7 },
    ]);
    expect(veraltet.ergebnisse).toEqual(['konflikt']);
    expect((await liste(db))[0]['stunden']).toBe(10);
  });

  it('meldet je Eintrag ein Ergebnis und ignoriert doppelte Zeilen', async () => {
    const db = new FakeEhrungenDb();
    const ergebnis = await importiere(db, [
      { nachname: 'Muster', vorname: 'Max', stunden: 1 },
      { nachname: 'muster', vorname: 'max', stunden: 2 },
      { nachname: 'Beispiel', vorname: 'Eva', stunden: 3 },
    ]);
    expect(ergebnis.ergebnisse).toEqual(['angelegt', 'doppelt', 'angelegt']);
    expect(await liste(db)).toHaveLength(2);
  });

  it('legt beim reinen Datenabgleich (anlegen=false) niemanden an', async () => {
    const db = new FakeEhrungenDb();
    const ergebnis = await importiere(
      db,
      [{ nachname: 'Muster', vorname: 'Max', eintrittsdatum: '2001-02-03' }],
      false,
    );
    expect(ergebnis.ergebnisse).toEqual(['nicht-gefunden']);
    expect(await liste(db)).toHaveLength(0);
  });

  it('übernimmt das Eintrittsdatum mit der Version', async () => {
    const db = new FakeEhrungenDb();
    await importiere(db, [{ nachname: 'Muster', vorname: 'Max', stunden: 10 }]);
    const ergebnis = await importiere(
      db,
      [{ nachname: 'Muster', vorname: 'Max', eintrittsdatum: '2001-02-03', version: 1 }],
      false,
    );
    expect(ergebnis.ergebnisse).toEqual(['aktualisiert']);
    expect((await liste(db))[0]).toMatchObject({ eintrittsdatum: '2001-02-03', stunden: 10 });
  });

  it.each([
    [{ anlegen: true, eintraege: [] }],
    [{ anlegen: true, eintraege: [{ nachname: 'A', vorname: 'B' }] }],
    [{ anlegen: true, eintraege: [{ nachname: 'A', vorname: 'B', stunden: -1 }] }],
    [{ anlegen: true, eintraege: [{ nachname: 'A', vorname: 'B', eintrittsdatum: '2001-02-30' }] }],
    [{ anlegen: true, eintraege: [{ nachname: '', vorname: 'B', stunden: 1 }] }],
    [{ eintraege: [{ nachname: 'A', vorname: 'B', stunden: 1 }] }],
  ])('lehnt ungültigen Import ab: %j', async (koerper) => {
    const db = new FakeEhrungenDb();
    const antwort = await verarbeiteEhrungen(
      anfrage('/api/personal/ehrungen/import', 'POST', koerper),
      umgebung(db),
      IDENTITAET,
    );
    expect(antwort.status).toBe(400);
    expect(db.zeilen.size).toBe(0);
  });
});

describe('Ehrungen: Einzelspeicherung', () => {
  async function angelegt(db: FakeEhrungenDb): Promise<string> {
    await importiere(db, [{ nachname: 'Muster', vorname: 'Max', stunden: 10 }]);
    return (await liste(db))[0]['id'] as string;
  }
  const koerper = {
    eintrittsdatum: '1999-05-06',
    besondereVerdienste: true,
    erhalten: { gold: 2021, bronze: null },
  };

  it('speichert mit If-Match, ordnet kanonisch und erhöht die Version', async () => {
    const db = new FakeEhrungenDb();
    const id = await angelegt(db);
    const antwort = await verarbeiteEhrungen(
      anfrage(`/api/personal/ehrungen/${id}`, 'PUT', koerper, { 'If-Match': 'W/"1"' }),
      umgebung(db),
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(await liste(db)).toMatchObject([
      {
        eintrittsdatum: '1999-05-06',
        besondereVerdienste: true,
        erhalten: { bronze: null, gold: 2021 },
        version: 2,
      },
    ]);
  });

  it('verlangt If-Match (428) und beantwortet einen veralteten Stand mit 412', async () => {
    const db = new FakeEhrungenDb();
    const id = await angelegt(db);
    const ohne = await verarbeiteEhrungen(
      anfrage(`/api/personal/ehrungen/${id}`, 'PUT', koerper),
      umgebung(db),
      IDENTITAET,
    );
    expect(ohne.status).toBe(428);
    const veraltet = await verarbeiteEhrungen(
      anfrage(`/api/personal/ehrungen/${id}`, 'PUT', koerper, { 'If-Match': '"9"' }),
      umgebung(db),
      IDENTITAET,
    );
    expect(veraltet.status).toBe(412);
  });

  it('lehnt unbekannte Auszeichnungen und unbekannte Personen ab', async () => {
    const db = new FakeEhrungenDb();
    const id = await angelegt(db);
    const unbekannt = await verarbeiteEhrungen(
      anfrage(
        `/api/personal/ehrungen/${id}`,
        'PUT',
        { ...koerper, erhalten: { platin: 2020 } },
        { 'If-Match': '"1"' },
      ),
      umgebung(db),
      IDENTITAET,
    );
    expect(unbekannt.status).toBe(400);
    const fremd = await verarbeiteEhrungen(
      anfrage('/api/personal/ehrungen/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PUT', koerper, {
        'If-Match': '"1"',
      }),
      umgebung(db),
      IDENTITAET,
    );
    expect(fremd.status).toBe(404);
  });

  it('lehnt unmögliche Vergabejahre ab und liest die frühere Liste ohne Jahr', async () => {
    const db = new FakeEhrungenDb();
    const id = await angelegt(db);
    for (const jahr of [1899, 2201, 2020.5, '2020']) {
      const antwort = await verarbeiteEhrungen(
        anfrage(
          `/api/personal/ehrungen/${id}`,
          'PUT',
          { ...koerper, erhalten: { gold: jahr } },
          { 'If-Match': '"1"' },
        ),
        umgebung(db),
        IDENTITAET,
      );
      expect(antwort.status).toBe(400);
    }
    db.zeilen.get(id)!.erhalten = '["silber"]';
    expect((await liste(db))[0]['erhalten']).toEqual({ silber: null });
  });

  it('löscht eine Person', async () => {
    const db = new FakeEhrungenDb();
    const id = await angelegt(db);
    const antwort = await verarbeiteEhrungen(
      anfrage(`/api/personal/ehrungen/${id}`, 'DELETE'),
      umgebung(db),
      IDENTITAET,
    );
    expect(antwort.status).toBe(204);
    expect(db.zeilen.size).toBe(0);
  });
});

describe('Ehrungen: Rahmen', () => {
  it('sperrt ohne Datenbank, bei Query und bei fremden Pfaden', async () => {
    expect(
      (await verarbeiteEhrungen(anfrage('/api/personal/ehrungen'), {}, IDENTITAET)).status,
    ).toBe(503);
    const db = new FakeEhrungenDb();
    expect(
      (await verarbeiteEhrungen(anfrage('/api/personal/ehrungen?x=1'), umgebung(db), IDENTITAET))
        .status,
    ).toBe(404);
    expect(
      (
        await verarbeiteEhrungen(
          anfrage('/api/personal/ehrungen/irgendwas'),
          umgebung(db),
          IDENTITAET,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await verarbeiteEhrungen(
          anfrage('/api/personal/ehrungen', 'POST', {}),
          umgebung(db),
          IDENTITAET,
        )
      ).status,
    ).toBe(405);
  });

  it('bildet die Vergleichsform wie der Client', () => {
    expect(personSchluessel(' Müller ', 'Anna  Maria')).toBe('müller|anna maria');
  });
});

describe('HiOrg mitglied_seit', () => {
  it('liest ISO- und deutsche Daten, sonst nichts', () => {
    expect(leseMitgliedSeit('1998-03-01')).toBe('1998-03-01');
    expect(leseMitgliedSeit('1998-03-01T00:00:00+01:00')).toBe('1998-03-01');
    expect(leseMitgliedSeit('01.03.1998')).toBe('1998-03-01');
    expect(leseMitgliedSeit('2001-02-30')).toBeUndefined();
    expect(leseMitgliedSeit('gestern')).toBeUndefined();
    expect(leseMitgliedSeit(null)).toBeUndefined();
    expect(leseMitgliedSeit(1998)).toBeUndefined();
  });
});
