import { describe, expect, it } from 'vitest';
import { verarbeiteEinsatzplanung } from '../src/einsatzplanung';
import { FakeEinsatzplanungDb } from './einsatzplanung-db-fake';

const IDENTITAET = { email: 'geprueft@example.test' };
const JSON_KOPF = { 'Content-Type': 'application/json' };
const NEU = { 'If-None-Match': '*' };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EINSATZ = id(900);
const AUFBAU = `/api/einsatzplanung/einsaetze/${EINSATZ}/aufbau`;
const VORLAGEN = '/api/einsatzplanung/aufbau-vorlagen';
const LAGER = '/api/einsatzplanung/lager';
const ARTIKEL = '/api/einsatzplanung/artikel';

function senden(
  db: FakeEinsatzplanungDb,
  methode: string,
  pfad: string,
  koerper?: unknown,
  kopf: Record<string, string> = {},
) {
  return verarbeiteEinsatzplanung(
    new Request(`https://stationwizard.example.test${pfad}`, {
      method: methode,
      headers: { ...JSON_KOPF, ...kopf },
      body: koerper === undefined ? undefined : JSON.stringify(koerper),
    }),
    { EINSATZPLANUNG_DB: db as never },
    IDENTITAET,
  );
}

const diagnose = (a: Response) => a.headers.get('X-Stationwizard-Diagnose');

async function vorbereiten() {
  const db = new FakeEinsatzplanungDb();
  db.einsaetze.set(EINSATZ, {
    id: EINSATZ,
    titel: 'Stadtfest',
    beginn: null,
    ende: null,
    ort: null,
    hiorg_veranstaltung_id: null,
    version: 1,
    angelegt_am: 'x',
    geaendert_am: 'x',
    angelegt_von: 'x',
    geaendert_von: 'x',
  });
  expect((await senden(db, 'POST', LAGER, { id: id(1), name: 'Medizinlager' }, NEU)).status).toBe(
    201,
  );
  for (const n of [11, 12]) {
    const a = await senden(
      db,
      'POST',
      ARTIKEL,
      { id: id(n), name: `Artikel ${n}`, einheit: 'Stück', lagerId: id(1) },
      NEU,
    );
    expect(a.status).toBe(201);
  }
  return db;
}

const kiste = (n: number, zusatz: Record<string, unknown> = {}) => ({
  art: 'kiste',
  id: id(n),
  kisteId: null,
  name: 'Verbandkiste',
  lagerId: id(1),
  anzahl: 2,
  inhalt: [{ artikelId: id(11), menge: 3, bemerkung: '' }],
  phase: null,
  ...zusatz,
});
const artikel = (n: number, zusatz: Record<string, unknown> = {}) => ({
  art: 'artikel',
  id: id(n),
  artikelId: id(12),
  menge: 85,
  bemerkung: '80–90',
  lagerId: id(1),
  phase: null,
  ...zusatz,
});
const einheit = (n: number, inhalt: unknown[] = [], zusatz: Record<string, unknown> = {}) => ({
  id: id(n),
  typ: 'wagen',
  name: 'Rollwagen 03',
  farbe: 'abschnitt-1',
  anweisung: '',
  bemerkung: '',
  inhalt,
  ...zusatz,
});
const aufbau = (einheiten: unknown[]) => ({
  vorlageId: null,
  vorlageVersion: null,
  inhalt: { anweisungen: '', einheiten },
});

describe('Aufbau eines Einsatzes', () => {
  it('speichert freie Artikel und freie Kisten ohne Stammdaten', async () => {
    const db = new FakeEinsatzplanungDb();
    db.einsaetze.set(EINSATZ, {
      id: EINSATZ,
      titel: 'Stadtfest',
      beginn: null,
      ende: null,
      ort: null,
      hiorg_veranstaltung_id: null,
      version: 1,
      angelegt_am: 'x',
      geaendert_am: 'x',
      angelegt_von: 'x',
      geaendert_von: 'x',
    });
    const frei = (n: number, zusatz: Record<string, unknown> = {}) => ({
      art: 'frei',
      id: id(n),
      name: 'Absperrband',
      einheit: 'Rollen',
      menge: 4,
      bemerkung: '',
      lagerId: null,
      phase: null,
      ...zusatz,
    });
    const leereKiste = kiste(31, { lagerId: null, inhalt: [] });
    const koerper = aufbau([einheit(20, [frei(22), leereKiste])]);
    expect((await senden(db, 'PUT', AUFBAU, koerper, NEU)).status).toBe(201);
    expect(db.aufbauten.get(EINSATZ)).toMatchObject({ einheiten: 1, kisten: 2, positionen: 1 });
    const mitPositionen = aufbau([
      einheit(20, [
        kiste(31, {
          lagerId: null,
          inhalt: [
            { artikelId: null, name: 'Hammer', einheit: 'Stück', menge: 1, bemerkung: '' },
            { artikelId: null, name: 'Hammer', einheit: 'Stück', menge: 2, bemerkung: '' },
          ],
        }),
      ]),
    ]);
    expect((await senden(db, 'PUT', AUFBAU, mitPositionen, { 'If-Match': '"1"' })).status).toBe(
      200,
    );
    const ohneName2 = aufbau([
      einheit(20, [
        kiste(31, {
          inhalt: [{ artikelId: null, name: '', einheit: '', menge: 1, bemerkung: '' }],
        }),
      ]),
    ]);
    expect((await senden(db, 'PUT', AUFBAU, ohneName2, { 'If-Match': '"2"' })).status).toBe(400);
    // Ein Quelllager muss es geben; ein Feld, das der Vertrag nicht kennt, wird abgelehnt.
    const unbekannt = aufbau([einheit(20, [frei(22, { lagerId: id(1) })])]);
    expect((await senden(db, 'PUT', AUFBAU, unbekannt, { 'If-Match': '"2"' })).status).toBe(400);
    const fremdesFeld = aufbau([einheit(20, [frei(22, { regal: 'A' })])]);
    expect((await senden(db, 'PUT', AUFBAU, fremdesFeld, { 'If-Match': '"2"' })).status).toBe(400);
    expect((await senden(db, 'POST', LAGER, { id: id(1), name: 'Medizinlager' }, NEU)).status).toBe(
      201,
    );
    const mitLager = aufbau([einheit(20, [frei(22, { lagerId: id(1) })])]);
    expect((await senden(db, 'PUT', AUFBAU, mitLager, { 'If-Match': '"2"' })).status).toBe(200);
    // Das Lager ist belegt: Löschen gesperrt, solange der freie Artikel darauf verweist.
    const gesperrt = await senden(db, 'DELETE', `${LAGER}/${id(1)}`, undefined, {
      'If-Match': '"1"',
    });
    expect(gesperrt.status).toBe(409);
    const ohneName = aufbau([einheit(20, [frei(22, { name: ' ' })])]);
    expect((await senden(db, 'PUT', AUFBAU, ohneName, { 'If-Match': '"2"' })).status).toBe(400);
  });

  it('legt an, liest, ändert nur mit der Version und zählt Kennzahlen', async () => {
    const db = await vorbereiten();
    const koerper = aufbau([einheit(20, [kiste(21), artikel(22)])]);
    const angelegt = await senden(db, 'PUT', AUFBAU, koerper, NEU);
    expect(angelegt.status).toBe(201);
    expect(db.aufbauten.get(EINSATZ)).toMatchObject({ einheiten: 1, kisten: 2, positionen: 2 });

    const gelesen = await senden(db, 'GET', AUFBAU);
    expect(gelesen.status).toBe(200);
    expect(gelesen.headers.get('ETag')).toBe('"1"');
    expect(await gelesen.json()).toEqual(koerper);

    expect((await senden(db, 'PUT', AUFBAU, koerper)).status).toBe(428);
    const geaendert = await senden(db, 'PUT', AUFBAU, aufbau([einheit(20)]), { 'If-Match': '"1"' });
    expect(geaendert.status).toBe(200);
    expect(db.aufbauten.get(EINSATZ)?.version).toBe(2);
    const veraltet = await senden(db, 'PUT', AUFBAU, koerper, { 'If-Match': '"1"' });
    expect(veraltet.status).toBe(412);
  });

  it('speichert das Kennzeichen Standard-Kiste nur bei leerem Inhalt und nur als true', async () => {
    const db = await vorbereiten();
    const koerper = aufbau([
      einheit(20, [
        kiste(21, { standardInhalt: true, inhalt: [] }),
        kiste(22, { standardInhalt: false, inhalt: [] }),
        kiste(23, {
          standardInhalt: true,
          inhalt: [{ artikelId: null, name: 'Hammer', einheit: 'Stück', menge: 1, bemerkung: '' }],
        }),
      ]),
    ]);
    expect((await senden(db, 'PUT', AUFBAU, koerper, NEU)).status).toBe(201);
    const gelesen = (await (await senden(db, 'GET', AUFBAU)).json()) as {
      inhalt: { einheiten: { inhalt: Record<string, unknown>[] }[] };
    };
    const eintraege = gelesen.inhalt.einheiten[0]!.inhalt;
    expect(eintraege[0]!['standardInhalt']).toBe(true);
    expect(eintraege[1]).not.toHaveProperty('standardInhalt');
    expect(eintraege[2]).not.toHaveProperty('standardInhalt');
  });

  it('speichert den Platz im Lager und lehnt fremde, unbekannte und lagerlose Plätze ab', async () => {
    const db = await vorbereiten();
    expect((await senden(db, 'POST', LAGER, { id: id(2), name: 'Kaltlager' }, NEU)).status).toBe(
      201,
    );
    const lager = (n: number, plaetze: unknown[], version: number) =>
      senden(
        db,
        'PUT',
        `${LAGER}/${id(n)}`,
        { id: id(n), name: n === 1 ? 'Medizinlager' : 'Kaltlager', plaetze },
        {
          'If-Match': `"${version}"`,
        },
      );
    expect((await lager(1, [{ id: id(40), name: 'Regal' }], 1)).status).toBe(200);
    const frei = {
      art: 'frei',
      id: id(51),
      name: 'Absperrband',
      einheit: 'Rollen',
      menge: 4,
      bemerkung: '',
      lagerId: id(1),
      platzId: id(40),
      phase: null,
    };
    const mitPlatz = aufbau([
      einheit(20, [
        frei,
        artikel(52, { platzId: id(40) }),
        kiste(53, { platzId: id(40) }),
        artikel(54),
      ]),
    ]);
    expect((await senden(db, 'PUT', AUFBAU, mitPlatz, NEU)).status).toBe(201);
    const gelesen = (await (await senden(db, 'GET', AUFBAU)).json()) as {
      inhalt: { einheiten: { inhalt: Record<string, unknown>[] }[] };
    };
    const eintraege = gelesen.inhalt.einheiten[0]!.inhalt;
    expect(eintraege.map((e) => e['platzId'])).toEqual([id(40), id(40), id(40), undefined]);

    // Platz eines anderen Lagers, unbekannter Platz und Platz ohne Lager.
    for (const eintrag of [
      artikel(52, { lagerId: id(2), platzId: id(40) }),
      artikel(52, { platzId: id(41) }),
      artikel(52, { lagerId: null, platzId: id(40) }),
      artikel(52, { platzId: 'keine-uuid' }),
    ]) {
      const abgelehnt = await senden(db, 'PUT', AUFBAU, aufbau([einheit(20, [eintrag])]), {
        'If-Match': '"1"',
      });
      expect(abgelehnt.status).toBe(400);
    }
    // Ein Platz, auf den der Aufbau verweist, lässt sich im Lager nicht entfernen.
    const gesperrt = await lager(1, [], 2);
    expect(gesperrt.status).toBe(409);
  });

  it('lehnt eine zweite Anlage, einen unbekannten Einsatz und fehlenden Aufbau ab', async () => {
    const db = await vorbereiten();
    expect((await senden(db, 'PUT', AUFBAU, aufbau([]), NEU)).status).toBe(201);
    expect((await senden(db, 'PUT', AUFBAU, aufbau([]), NEU)).status).toBe(409);
    const fremd = `/api/einsatzplanung/einsaetze/${id(901)}/aufbau`;
    expect((await senden(db, 'PUT', fremd, aufbau([]), NEU)).status).toBe(404);
    const keiner = await senden(db, 'GET', fremd);
    expect(keiner.status).toBe(404);
    expect(diagnose(keiner)).toBe('EINSATZPLANUNG_AUFBAU_NICHT_GEFUNDEN');
  });

  it('löscht nur mit der aktuellen Version', async () => {
    const db = await vorbereiten();
    await senden(db, 'PUT', AUFBAU, aufbau([]), NEU);
    expect((await senden(db, 'DELETE', AUFBAU, undefined, { 'If-Match': '"7"' })).status).toBe(412);
    expect((await senden(db, 'DELETE', AUFBAU, undefined, { 'If-Match': '"1"' })).status).toBe(204);
    expect(db.aufbauten.size).toBe(0);
  });

  it.each([
    ['unbekanntes Feld', aufbau([einheit(20, [], { extra: 1 })])],
    ['doppelte Id über Ebenen', aufbau([einheit(20, [artikel(20)])])],
    ['unbekannte Farbe', aufbau([einheit(20, [], { farbe: 'rot' })])],
    ['Menge null', aufbau([einheit(20, [artikel(21, { menge: 0 })])])],
    ['Menge mit vier Nachkommastellen', aufbau([einheit(20, [artikel(21, { menge: 1.0001 })])])],
    ['Anzahl null', aufbau([einheit(20, [kiste(21, { anzahl: 0 })])])],
    [
      'Standard-Kennzeichen kein Wahrheitswert',
      aufbau([einheit(20, [kiste(21, { standardInhalt: 'ja' })])]),
    ],
    ['Kiste ohne Namen', aufbau([einheit(20, [kiste(21, { name: ' ' })])])],
    ['unbekannte Phase', aufbau([einheit(20, [artikel(21, { phase: 'nachher' })])])],
    [
      'Wagen außerhalb eines Fahrzeugs',
      aufbau([einheit(20, [{ art: 'wagen', id: id(21), einheit: einheit(22) }])]),
    ],
    [
      'Fahrzeug in einem Fahrzeug',
      aufbau([
        einheit(20, [{ art: 'wagen', id: id(21), einheit: einheit(22, [], { typ: 'fahrzeug' }) }], {
          typ: 'fahrzeug',
        }),
      ]),
    ],
    [
      'Wagen im Wagen im Fahrzeug',
      aufbau([
        einheit(
          20,
          [
            {
              art: 'wagen',
              id: id(21),
              einheit: einheit(22, [{ art: 'wagen', id: id(23), einheit: einheit(24) }]),
            },
          ],
          { typ: 'fahrzeug' },
        ),
      ]),
    ],
    ['Foto kein JPEG', aufbau([einheit(20, [], { foto: 'data:image/png;base64,AAAA' })])],
    [
      'Artikel doppelt in einer Kiste',
      aufbau([
        einheit(20, [
          kiste(21, {
            inhalt: [
              { artikelId: id(11), menge: 1, bemerkung: '' },
              { artikelId: id(11), menge: 2, bemerkung: '' },
            ],
          }),
        ]),
      ]),
    ],
  ])('lehnt ab: %s', async (_name, koerper) => {
    const db = await vorbereiten();
    const antwort = await senden(db, 'PUT', AUFBAU, koerper, NEU);
    expect(antwort.status).toBe(400);
    expect(diagnose(antwort)).toBe('EINSATZPLANUNG_UNGUELTIG');
    expect(db.aufbauten.size).toBe(0);
  });

  it('nimmt einen Wagen in einem Fahrzeug an und zählt beide Einheiten', async () => {
    const db = await vorbereiten();
    const fahrzeug = einheit(
      20,
      [{ art: 'wagen', id: id(21), einheit: einheit(22, [kiste(23)]) }],
      {
        typ: 'fahrzeug',
        name: 'GW-San 1',
      },
    );
    expect((await senden(db, 'PUT', AUFBAU, aufbau([fahrzeug]), NEU)).status).toBe(201);
    expect(db.aufbauten.get(EINSATZ)).toMatchObject({ einheiten: 2, kisten: 2 });
  });

  it('lehnt mehr als 60 Einheiten ab', async () => {
    const db = await vorbereiten();
    const viele = Array.from({ length: 61 }, (_, i) => einheit(100 + i));
    expect((await senden(db, 'PUT', AUFBAU, aufbau(viele), NEU)).status).toBe(400);
  });

  it('prüft Artikel und Lager gegen die Stammdaten, auch in Kisten und bei vielen Verweisen', async () => {
    const db = await vorbereiten();
    const unbekannterArtikel = aufbau([einheit(20, [artikel(21, { artikelId: id(99) })])]);
    expect((await senden(db, 'PUT', AUFBAU, unbekannterArtikel, NEU)).status).toBe(400);
    const inKiste = aufbau([
      einheit(20, [kiste(21, { inhalt: [{ artikelId: id(98), menge: 1, bemerkung: '' }] })]),
    ]);
    expect((await senden(db, 'PUT', AUFBAU, inKiste, NEU)).status).toBe(400);
    const unbekanntesLager = aufbau([einheit(20, [artikel(21, { lagerId: id(97) })])]);
    expect((await senden(db, 'PUT', AUFBAU, unbekanntesLager, NEU)).status).toBe(400);
    expect(db.aufbauten.size).toBe(0);
  });

  it('schützt Artikel und Lager vor dem Löschen, solange ein Aufbau darauf verweist', async () => {
    const db = await vorbereiten();
    await senden(db, 'PUT', AUFBAU, aufbau([einheit(20, [artikel(21)])]), NEU);
    const artikelLoeschen = await senden(db, 'DELETE', `${ARTIKEL}/${id(12)}`, undefined, {
      'If-Match': '"1"',
    });
    expect(artikelLoeschen.status).toBe(409);
    expect(diagnose(artikelLoeschen)).toBe('EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG');
    // Lager hängt zusätzlich an Artikeln; erst den Aufbau-Verweis allein prüfen.
    db.artikel.clear();
    const lagerLoeschen = await senden(db, 'DELETE', `${LAGER}/${id(1)}`, undefined, {
      'If-Match': '"1"',
    });
    expect(lagerLoeschen.status).toBe(409);
    expect(diagnose(lagerLoeschen)).toBe('EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG');
  });
});

describe('Aufbau-Vorlagen', () => {
  const vorlage = (n: number, titel = 'Sanitätsdienst Standard') => ({
    id: id(n),
    titel,
    inhalt: { anweisungen: '', einheiten: [einheit(n + 100, [kiste(n + 101)])] },
  });

  it('legt an, listet Kopfdaten mit Kennzahlen, ändert und löscht mit Version', async () => {
    const db = await vorbereiten();
    expect((await senden(db, 'POST', VORLAGEN, vorlage(30), NEU)).status).toBe(201);
    expect((await senden(db, 'POST', VORLAGEN, vorlage(30))).status).toBe(428);
    expect((await senden(db, 'POST', VORLAGEN, vorlage(30), NEU)).status).toBe(409);

    const liste = await (await senden(db, 'GET', VORLAGEN)).json();
    expect(liste).toEqual({
      vorlagen: [
        expect.objectContaining({
          id: id(30),
          titel: 'Sanitätsdienst Standard',
          einheiten: 1,
          kisten: 2,
          positionen: 1,
        }),
      ],
    });

    const einzeln = await senden(db, 'GET', `${VORLAGEN}/${id(30)}`);
    expect(einzeln.headers.get('ETag')).toBe('"1"');
    const neu = { ...vorlage(30, 'Umbenannt') };
    expect(
      (await senden(db, 'PUT', `${VORLAGEN}/${id(30)}`, neu, { 'If-Match': '"4"' })).status,
    ).toBe(412);
    expect(
      (await senden(db, 'PUT', `${VORLAGEN}/${id(30)}`, neu, { 'If-Match': '"1"' })).status,
    ).toBe(200);
    expect(
      (await senden(db, 'PUT', `${VORLAGEN}/${id(31)}`, neu, { 'If-Match': '"1"' })).status,
    ).toBe(400);
    expect(
      (await senden(db, 'DELETE', `${VORLAGEN}/${id(30)}`, undefined, { 'If-Match': '"2"' }))
        .status,
    ).toBe(204);
    const weg = await senden(db, 'GET', `${VORLAGEN}/${id(30)}`);
    expect(weg.status).toBe(404);
    expect(diagnose(weg)).toBe('EINSATZPLANUNG_AUFBAU_VORLAGE_NICHT_GEFUNDEN');
  });

  it('prüft Verweise auch in Vorlagen und schützt Artikel vor dem Löschen', async () => {
    const db = await vorbereiten();
    const kaputt = vorlage(30);
    kaputt.inhalt.einheiten[0] = einheit(130, [artikel(131, { artikelId: id(99) })]);
    expect((await senden(db, 'POST', VORLAGEN, kaputt, NEU)).status).toBe(400);
    await senden(db, 'POST', VORLAGEN, vorlage(30), NEU);
    const loeschen = await senden(db, 'DELETE', `${ARTIKEL}/${id(11)}`, undefined, {
      'If-Match': '"1"',
    });
    expect(loeschen.status).toBe(409);
  });
});
