import { describe, expect, it } from 'vitest';
import { verarbeiteBenutzerUnterschrift } from '../src/benutzer-unterschrift';
import { pruefeUnterschrift } from '../src/unterschrift-pruefung';
import { SqliteD1 } from './sqlite-d1';

const ICH = { email: 'ich@example.test' };
const ANDERE = { email: 'andere@example.test' };

function anfrage(methode: string, koerper?: unknown, pfad = '/api/benutzer/unterschrift'): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, {
    method: methode,
    headers: koerper === undefined ? {} : { 'Content-Type': 'application/json' },
    body: koerper === undefined ? undefined : JSON.stringify(koerper),
  });
}

function umgebung() {
  return { BENUTZER_DB: new SqliteD1(['benutzer']) as never };
}

const SCHRIFT = { art: 'schrift', text: 'Max Mustermann', font: 'Caveat' };
const ZEICHNUNG = {
  art: 'zeichnung',
  striche: [
    [
      [10, 20],
      [30, 40],
    ],
  ],
};

describe('pruefeUnterschrift', () => {
  it('nimmt Schrift und Zeichnung an und kürzt Leerraum', () => {
    expect(pruefeUnterschrift({ ...SCHRIFT, text: '  Max  ' })).toEqual({
      ...SCHRIFT,
      text: 'Max',
    });
    expect(pruefeUnterschrift(ZEICHNUNG)).toEqual(ZEICHNUNG);
  });

  it.each([
    ['unbekannte Art', { art: 'bild', daten: 'x' }],
    ['unbekanntes Feld', { ...SCHRIFT, extra: 1 }],
    ['leerer Text', { ...SCHRIFT, text: '   ' }],
    ['zu langer Text', { ...SCHRIFT, text: 'x'.repeat(81) }],
    ['fremde Schrift', { ...SCHRIFT, font: 'Comic Sans' }],
    ['keine Striche', { art: 'zeichnung', striche: [] }],
    ['leerer Strich', { art: 'zeichnung', striche: [[]] }],
    ['Koordinate außerhalb', { art: 'zeichnung', striche: [[[481, 0]]] }],
    ['Kommazahl', { art: 'zeichnung', striche: [[[1.5, 0]]] }],
    ['zu viele Striche', { art: 'zeichnung', striche: Array.from({ length: 21 }, () => [[1, 1]]) }],
    [
      'zu viele Punkte',
      { art: 'zeichnung', striche: [Array.from({ length: 2001 }, () => [1, 1])] },
    ],
    ['kein Objekt', 'Max'],
  ])('lehnt %s ab', (_name, wert) => {
    expect(pruefeUnterschrift(wert)).toBeNull();
  });
});

describe('verarbeiteBenutzerUnterschrift', () => {
  it('sperrt ohne Datenbank mit festem Code', async () => {
    const antwort = await verarbeiteBenutzerUnterschrift(anfrage('GET'), {}, ICH);
    expect(antwort.status).toBe(503);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'UNTERSCHRIFT_KONFIGURATION_FEHLT',
    );
  });

  it('liefert ohne Eintrag null, speichert, ersetzt und löscht', async () => {
    const env = umgebung();
    expect(await (await verarbeiteBenutzerUnterschrift(anfrage('GET'), env, ICH)).json()).toEqual({
      unterschrift: null,
      geaendertAm: null,
    });

    const gespeichert = await verarbeiteBenutzerUnterschrift(anfrage('PUT', SCHRIFT), env, ICH);
    expect(gespeichert.status).toBe(200);
    const antwort = (await (
      await verarbeiteBenutzerUnterschrift(anfrage('GET'), env, ICH)
    ).json()) as {
      unterschrift: unknown;
    };
    expect(antwort.unterschrift).toEqual(SCHRIFT);

    await verarbeiteBenutzerUnterschrift(anfrage('PUT', ZEICHNUNG), env, ICH);
    const ersetzt = (await (
      await verarbeiteBenutzerUnterschrift(anfrage('GET'), env, ICH)
    ).json()) as {
      unterschrift: unknown;
    };
    expect(ersetzt.unterschrift).toEqual(ZEICHNUNG);

    await verarbeiteBenutzerUnterschrift(anfrage('DELETE'), env, ICH);
    const leer = (await (
      await verarbeiteBenutzerUnterschrift(anfrage('GET'), env, ICH)
    ).json()) as {
      unterschrift: unknown;
    };
    expect(leer.unterschrift).toBeNull();
  });

  it('trennt die Unterschriften der Personen strikt', async () => {
    const env = umgebung();
    await verarbeiteBenutzerUnterschrift(anfrage('PUT', SCHRIFT), env, ICH);
    const fremd = (await (
      await verarbeiteBenutzerUnterschrift(anfrage('GET'), env, ANDERE)
    ).json()) as {
      unterschrift: unknown;
    };
    expect(fremd.unterschrift).toBeNull();
    await verarbeiteBenutzerUnterschrift(anfrage('DELETE'), env, ANDERE);
    const meine = (await (
      await verarbeiteBenutzerUnterschrift(anfrage('GET'), env, ICH)
    ).json()) as {
      unterschrift: unknown;
    };
    expect(meine.unterschrift).toEqual(SCHRIFT);
  });

  it('lehnt ungültige Körper, falschen Inhaltstyp und Abfrageparameter ab', async () => {
    const env = umgebung();
    const ungueltig = await verarbeiteBenutzerUnterschrift(
      anfrage('PUT', { art: 'schrift', text: '', font: 'Caveat' }),
      env,
      ICH,
    );
    expect(ungueltig.status).toBe(400);
    expect(ungueltig.headers.get('X-Stationwizard-Diagnose')).toBe('UNTERSCHRIFT_DATEI_UNGUELTIG');

    const textTyp = await verarbeiteBenutzerUnterschrift(
      new Request('https://stationwizard.example.test/api/benutzer/unterschrift', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: 'x',
      }),
      env,
      ICH,
    );
    expect(textTyp.status).toBe(415);

    const abfrage = await verarbeiteBenutzerUnterschrift(
      anfrage('GET', undefined, '/api/benutzer/unterschrift?email=andere@example.test'),
      env,
      ICH,
    );
    expect(abfrage.status).toBe(404);
  });

  it('erlaubt keine anderen Methoden', async () => {
    const antwort = await verarbeiteBenutzerUnterschrift(anfrage('POST', SCHRIFT), umgebung(), ICH);
    expect(antwort.status).toBe(405);
  });
});
