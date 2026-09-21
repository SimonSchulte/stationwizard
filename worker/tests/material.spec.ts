import { describe, expect, it } from 'vitest';
import { verarbeiteMaterial } from '../src/material';
import { FakeMaterialDb } from './material-db-fake';

const VORLAGE_ID = '4e465200-0000-4000-8000-000000000000';
const FACH_ID = '4e465200-0000-4000-8000-000000000001';
const ARTIKEL_ID = '4e465201-0000-4000-8000-000000000001';
const BEHAELTER_ID = '11111111-2222-4333-8444-555555555555';
const FAHRZEUG_ID = '01234567-89ab-4cde-8fab-0123456789ab';
const IDENTITAET = { email: 'geprueft@example.test' };

function anfrage(pfad: string, init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

function vorlageKoerper(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: VORLAGE_ID,
    bezeichnung: 'Prüfvorlage Übung',
    beschreibung: 'Erfundene Liste für den Test.',
    grundlage: 'Erfundene Grundlage',
    faecher: [
      {
        id: FACH_ID,
        bezeichnung: 'Erstes Fach',
        artikel: [
          {
            id: ARTIKEL_ID,
            bezeichnung: 'Erfundener Artikel',
            sollMenge: 2,
            einheit: '',
            herkunft: 'beide',
            verfallsdatumPflicht: true,
          },
        ],
      },
    ],
    ...ueberschreibung,
  };
}

function behaelterKoerper(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: BEHAELTER_ID,
    fahrzeugId: FAHRZEUG_ID,
    vorlageId: VORLAGE_ID,
    bezeichnung: 'Rucksack 3',
    bemerkung: '',
    ...ueberschreibung,
  };
}

function db(): FakeMaterialDb {
  const datenbank = new FakeMaterialDb();
  datenbank.fahrzeuge.set(FAHRZEUG_ID, {
    id: FAHRZEUG_ID,
    bezeichnung: 'GW SAN Übung',
    funkrufname: 'Florian Testort 1/59/1',
    gruppe: 'sanitaet',
  });
  return datenbank;
}

function verarbeite(datenbank: FakeMaterialDb, pfad: string, init?: RequestInit) {
  return verarbeiteMaterial(anfrage(pfad, init), { FAHRZEUGE_DB: datenbank as never }, IDENTITAET);
}

function legeVorlageAn(datenbank: FakeMaterialDb, koerper = vorlageKoerper()) {
  return verarbeite(datenbank, '/api/material/vorlagen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
    body: JSON.stringify(koerper),
  });
}

async function legeBehaelterAn(datenbank: FakeMaterialDb, koerper = behaelterKoerper()) {
  await legeVorlageAn(datenbank);
  return verarbeite(datenbank, '/api/material/behaelter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
    body: JSON.stringify(koerper),
  });
}

describe('verarbeiteMaterial – Rahmenbedingungen', () => {
  it('sperrt ohne D1-Binding statt mit einem Absturz', async () => {
    const antwort = await verarbeiteMaterial(anfrage('/api/material/vorlagen'), {}, IDENTITAET);
    expect(antwort.status).toBe(503);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_KONFIGURATION_FEHLT');
  });

  it('weist einen Pfad mit Query-Parametern ab, statt ihn auszuwerten', async () => {
    const antwort = await verarbeite(db(), '/api/material/vorlagen?alles=ja');
    expect(antwort.status).toBe(404);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_PFAD_UNGUELTIG');
  });

  it('nennt bei falscher Methode die erlaubten Methoden', async () => {
    const antwort = await verarbeite(db(), '/api/material/vorlagen', { method: 'DELETE' });
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET, POST');
  });
});

describe('POST /api/material/vorlagen', () => {
  it('legt mit If-None-Match: * eine Vorlage an und setzt die Identität serverseitig', async () => {
    const datenbank = db();
    const antwort = await legeVorlageAn(datenbank, {
      ...vorlageKoerper(),
      geaendertVon: 'vorgetaeuscht@example.test',
    });
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
    const inhalt = (await antwort.json()) as { geaendertVon: string };
    expect(inhalt.geaendertVon).toBe(IDENTITAET.email);
  });

  it('weist das Anlegen ohne If-None-Match mit 428 ab', async () => {
    const antwort = await verarbeite(db(), '/api/material/vorlagen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vorlageKoerper()),
    });
    expect(antwort.status).toBe(428);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_VORBEDINGUNG_FEHLT');
  });

  it('weist eine Vorlage mit doppelter Artikel-Id ab, weil die Zuordnung sonst mehrdeutig wäre', async () => {
    const fach = {
      id: FACH_ID,
      bezeichnung: 'Erstes Fach',
      artikel: [
        {
          id: ARTIKEL_ID,
          bezeichnung: 'A',
          sollMenge: 1,
          einheit: '',
          herkunft: 'seg',
          verfallsdatumPflicht: false,
        },
        {
          id: ARTIKEL_ID,
          bezeichnung: 'B',
          sollMenge: 1,
          einheit: '',
          herkunft: 'seg',
          verfallsdatumPflicht: false,
        },
      ],
    };
    const antwort = await legeVorlageAn(db(), vorlageKoerper({ faecher: [fach] }));
    expect(antwort.status).toBe(400);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_DATEI_UNGUELTIG');
  });

  it('weist eine unbekannte Herkunft ab', async () => {
    const antwort = await legeVorlageAn(
      db(),
      vorlageKoerper({
        faecher: [
          {
            id: FACH_ID,
            bezeichnung: 'F',
            artikel: [
              {
                id: ARTIKEL_ID,
                bezeichnung: 'A',
                sollMenge: 1,
                einheit: '',
                herkunft: 'bund',
                verfallsdatumPflicht: false,
              },
            ],
          },
        ],
      }),
    );
    expect(antwort.status).toBe(400);
  });

  it('weist eine Sollmenge von null ab, weil eine Position ohne Soll nichts zu prüfen hätte', async () => {
    const antwort = await legeVorlageAn(
      db(),
      vorlageKoerper({
        faecher: [
          {
            id: FACH_ID,
            bezeichnung: 'F',
            artikel: [
              {
                id: ARTIKEL_ID,
                bezeichnung: 'A',
                sollMenge: 0,
                einheit: '',
                herkunft: 'seg',
                verfallsdatumPflicht: false,
              },
            ],
          },
        ],
      }),
    );
    expect(antwort.status).toBe(400);
  });
});

describe('GET /api/material/vorlagen', () => {
  it('liefert in der Liste Kennzahlen statt des gesamten Baums', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    const antwort = await verarbeite(datenbank, '/api/material/vorlagen');
    const inhalt = (await antwort.json()) as {
      vorlagen: { anzahlFaecher: number; anzahlArtikel: number; faecher?: unknown }[];
    };
    expect(inhalt.vorlagen).toHaveLength(1);
    expect(inhalt.vorlagen[0]?.anzahlFaecher).toBe(1);
    expect(inhalt.vorlagen[0]?.anzahlArtikel).toBe(1);
    expect(inhalt.vorlagen[0]?.faecher).toBeUndefined();
  });
});

describe('PUT /api/material/vorlagen/<UUID>', () => {
  async function speichere(datenbank: FakeMaterialDb, etag: string | null) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (etag !== null) headers['If-Match'] = etag;
    return verarbeite(datenbank, `/api/material/vorlagen/${VORLAGE_ID}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(vorlageKoerper({ bezeichnung: 'Geändert' })),
    });
  }

  it('speichert mit passender Version und erhöht den ETag', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    const antwort = await speichere(datenbank, '"1"');
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('ETag')).toBe('"2"');
  });

  it('nimmt einen abgeschwächten ETag an, weil Cloudflare starke ETags unterwegs abschwächt', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    const antwort = await speichere(datenbank, 'W/"1"');
    expect(antwort.status).toBe(200);
  });

  it('meldet bei veraltetem Stand einen Konflikt statt zu überschreiben', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    await speichere(datenbank, '"1"');
    const antwort = await speichere(datenbank, '"1"');
    expect(antwort.status).toBe(412);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_VERSIONSKONFLIKT');
  });

  it('verlangt ohne If-Match eine Vorbedingung statt blind zu speichern', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    const antwort = await speichere(datenbank, null);
    expect(antwort.status).toBe(428);
  });

  it('weist einen unlesbaren If-Match-Wert mit 400 ab', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    const antwort = await speichere(datenbank, 'irgendwas');
    expect(antwort.status).toBe(400);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_VORBEDINGUNG_UNGUELTIG');
  });
});

describe('DELETE /api/material/vorlagen/<UUID>', () => {
  it('verweigert das Löschen, solange ein Behälter die Vorlage verwendet', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await verarbeite(datenbank, `/api/material/vorlagen/${VORLAGE_ID}`, {
      method: 'DELETE',
    });
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_VORLAGE_IN_BENUTZUNG');
  });

  it('löscht eine unbenutzte Vorlage', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    const antwort = await verarbeite(datenbank, `/api/material/vorlagen/${VORLAGE_ID}`, {
      method: 'DELETE',
    });
    expect(antwort.status).toBe(204);
    expect(datenbank.vorlagen.size).toBe(0);
  });
});

describe('Behälter', () => {
  it('legt einen Behälter an und vergibt dabei serverseitig ein Prüftoken', async () => {
    const datenbank = db();
    const antwort = await legeBehaelterAn(datenbank);
    expect(antwort.status).toBe(201);
    expect(datenbank.behaelter.get(BEHAELTER_ID)?.check_token).toBeTruthy();
  });

  it('gibt das Prüftoken in keiner Behälterantwort preis', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const einzeln = await verarbeite(datenbank, `/api/material/behaelter/${BEHAELTER_ID}`);
    const liste = await verarbeite(datenbank, '/api/material/behaelter');
    const token = datenbank.behaelter.get(BEHAELTER_ID)?.check_token ?? '';
    expect(token).not.toBe('');
    expect(await einzeln.text()).not.toContain(token);
    expect(await liste.text()).not.toContain(token);
  });

  it('weist einen Behälter auf einem unbekannten Fahrzeug ab', async () => {
    const datenbank = db();
    await legeVorlageAn(datenbank);
    const antwort = await verarbeite(datenbank, '/api/material/behaelter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
      body: JSON.stringify(
        behaelterKoerper({ fahrzeugId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
      ),
    });
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_FAHRZEUG_UNBEKANNT');
  });

  it('weist einen Behälter mit unbekannter Vorlage ab', async () => {
    const datenbank = db();
    const antwort = await verarbeite(datenbank, '/api/material/behaelter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
      body: JSON.stringify(behaelterKoerper()),
    });
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_VORLAGE_NICHT_GEFUNDEN');
  });

  it('liefert die Übersicht mit Fahrzeug und Vorlage in einem Aufruf', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await verarbeite(datenbank, '/api/material/behaelter');
    const inhalt = (await antwort.json()) as {
      behaelter: {
        fahrzeugBezeichnung: string;
        vorlageBezeichnung: string;
        zuletztGeprueftAm: string | null;
      }[];
    };
    expect(inhalt.behaelter[0]?.fahrzeugBezeichnung).toBe('GW SAN Übung');
    expect(inhalt.behaelter[0]?.vorlageBezeichnung).toBe('Prüfvorlage Übung');
    expect(inhalt.behaelter[0]?.zuletztGeprueftAm).toBeNull();
  });

  it('meldet in der Übersicht den jüngsten Check des Behälters', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    datenbank.checks.push(
      {
        id: 'a',
        behaelter_id: BEHAELTER_ID,
        geprueft_am: '2026-01-05',
        erfasst_am: '2026-01-05T08:00:00.000Z',
        fehlmengen: 9,
        unbrauchbar: 0,
        abgelaufen: 0,
      },
      {
        id: 'b',
        behaelter_id: BEHAELTER_ID,
        geprueft_am: '2026-03-01',
        erfasst_am: '2026-03-01T08:00:00.000Z',
        fehlmengen: 2,
        unbrauchbar: 1,
        abgelaufen: 3,
      },
    );
    const antwort = await verarbeite(datenbank, '/api/material/behaelter');
    const inhalt = (await antwort.json()) as {
      behaelter: { zuletztGeprueftAm: string; letzteFehlmengen: number }[];
    };
    expect(inhalt.behaelter[0]?.zuletztGeprueftAm).toBe('2026-03-01');
    expect(inhalt.behaelter[0]?.letzteFehlmengen).toBe(2);
  });

  it('verweigert das Löschen, solange für den Behälter Checks erfasst sind', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    datenbank.checks.push({
      id: 'a',
      behaelter_id: BEHAELTER_ID,
      geprueft_am: '2026-01-05',
      erfasst_am: '2026-01-05T08:00:00.000Z',
      fehlmengen: 0,
      unbrauchbar: 0,
      abgelaufen: 0,
    });
    const antwort = await verarbeite(datenbank, `/api/material/behaelter/${BEHAELTER_ID}`, {
      method: 'DELETE',
    });
    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_BEHAELTER_IN_BENUTZUNG');
  });
});

describe('Fahrzeugcheck', () => {
  const CHECK_ID = '99999999-8888-4777-8666-555555555555';

  function checkKoerper(ueberschreibung: Record<string, unknown> = {}) {
    return {
      id: CHECK_ID,
      verfallsdatumErfasst: true,
      bemerkung: '',
      positionen: [
        {
          artikelId: ARTIKEL_ID,
          geprueft: true,
          istMenge: 2,
          unbrauchbar: false,
          verfallsdaten: ['2027-05', null],
        },
      ],
      ...ueberschreibung,
    };
  }

  async function reicheEin(datenbank: FakeMaterialDb, koerper = checkKoerper(), etag = '*') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (etag) headers['If-None-Match'] = etag;
    return verarbeite(datenbank, `/api/material/behaelter/${BEHAELTER_ID}/checks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(koerper),
    });
  }

  it('liefert Behälter, Fahrzeug und Vorlage in einem einzigen Aufruf', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await verarbeite(
      datenbank,
      `/api/material/behaelter/${BEHAELTER_ID}/pruefauftrag`,
    );
    expect(antwort.status).toBe(200);
    const inhalt = (await antwort.json()) as {
      behaelter: { fahrzeugBezeichnung: string };
      vorlage: { faecher: unknown[]; version: number };
    };
    expect(inhalt.behaelter.fahrzeugBezeichnung).toBe('GW SAN Übung');
    expect(inhalt.vorlage.faecher).toHaveLength(1);
    expect(inhalt.vorlage.version).toBe(1);
  });

  it('gibt auch im Prüfauftrag das Prüftoken nicht preis', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await verarbeite(
      datenbank,
      `/api/material/behaelter/${BEHAELTER_ID}/pruefauftrag`,
    );
    const token = datenbank.behaelter.get(BEHAELTER_ID)?.check_token ?? '';
    expect(token).not.toBe('');
    expect(await antwort.text()).not.toContain(token);
  });

  it('nimmt einen Check an und setzt Identität, Zeitpunkt und Quelle serverseitig', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await reicheEin(datenbank, {
      ...checkKoerper(),
      erfasstVon: 'vorgetaeuscht@example.test',
      quelle: 'oeffentlich',
      geprueftAm: '1999-01-01',
    });
    expect(antwort.status).toBe(201);
    const gespeichert = datenbank.checks[0];
    expect(gespeichert?.erfasst_von).toBe(IDENTITAET.email);
    expect(gespeichert?.quelle).toBe('angemeldet');
    expect(gespeichert?.geprueft_am).not.toBe('1999-01-01');
  });

  it('berechnet die Kennzahlen selbst und übernimmt keine aus dem Anfragekörper', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    await reicheEin(datenbank, {
      ...checkKoerper({
        positionen: [
          {
            artikelId: ARTIKEL_ID,
            geprueft: true,
            istMenge: 1,
            unbrauchbar: true,
            verfallsdaten: ['2020-01', null],
          },
        ],
      }),
      fehlmengen: 0,
      unbrauchbar: 0,
      abgelaufen: 0,
    });
    const gespeichert = datenbank.checks[0];
    expect(gespeichert?.fehlmengen).toBe(1);
    expect(gespeichert?.unbrauchbar).toBe(1);
    expect(gespeichert?.abgelaufen).toBe(1);
  });

  it('schreibt den ganzen Check als eine einzige Zeile', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    await reicheEin(datenbank);
    expect(datenbank.checks).toHaveLength(1);
    expect(JSON.parse(datenbank.checks[0]?.positionen ?? '[]')).toHaveLength(1);
  });

  it('weist einen Check ohne eine einzige geprüfte Position ab', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await reicheEin(
      datenbank,
      checkKoerper({
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
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MATERIAL_CHECK_OHNE_PRUEFUNG');
    expect(datenbank.checks).toHaveLength(0);
  });

  it('weist einen Check mit einem der Vorlage unbekannten Artikel ab', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await reicheEin(
      datenbank,
      checkKoerper({
        positionen: [
          {
            artikelId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            geprueft: true,
            istMenge: 1,
            unbrauchbar: false,
            verfallsdaten: [null],
          },
        ],
      }),
    );
    expect(antwort.status).toBe(400);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'MATERIAL_CHECK_POSITIONEN_UNGUELTIG',
    );
  });

  it('weist einen Check ohne If-None-Match ab', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    const antwort = await reicheEin(datenbank, checkKoerper(), '');
    expect(antwort.status).toBe(428);
  });

  it('weist einen Check auf einem unbekannten Behälter ab', async () => {
    const datenbank = db();
    const antwort = await reicheEin(datenbank);
    expect(antwort.status).toBe(404);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'MATERIAL_BEHAELTER_NICHT_GEFUNDEN',
    );
  });

  it('führt die Historie ohne Positionen, den Einzelabruf mit', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    await reicheEin(datenbank);

    const historie = await verarbeite(datenbank, `/api/material/behaelter/${BEHAELTER_ID}/checks`);
    const liste = (await historie.json()) as { checks: Record<string, unknown>[] };
    expect(liste.checks).toHaveLength(1);
    expect(liste.checks[0]?.['positionen']).toBeUndefined();

    const einzeln = await verarbeite(datenbank, `/api/material/checks/${CHECK_ID}`);
    const check = (await einzeln.json()) as { positionen: unknown[] };
    expect(check.positionen).toHaveLength(1);
  });

  it('erlaubt kein Ändern eines Checks – ein Check wird nie überschrieben', async () => {
    const datenbank = db();
    await legeBehaelterAn(datenbank);
    await reicheEin(datenbank);
    const antwort = await verarbeite(datenbank, `/api/material/checks/${CHECK_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
      body: JSON.stringify(checkKoerper()),
    });
    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET');
  });
});
