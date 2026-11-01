import { describe, expect, it } from 'vitest';
import { leseJsonKoerper, UUID_REGEX } from '../src/json-lesen';

const CODES = {
  inhaltstyp: 'TEST_INHALTSTYP_UNGUELTIG',
  zuGross: 'TEST_ZU_GROSS',
  unlesbar: 'TEST_UNLESBAR',
};

function anfrage(koerper: string, inhaltstyp: string | null = 'application/json'): Request {
  const kopf = new Headers();
  if (inhaltstyp) kopf.set('Content-Type', inhaltstyp);
  return new Request('https://beispiel.invalid/api/test', {
    method: 'POST',
    headers: kopf,
    body: koerper,
  });
}

async function diagnose(antwort: { inhalt: unknown } | Response): Promise<[number, string]> {
  if (!(antwort instanceof Response)) throw new Error('Antwort erwartet');
  return [antwort.status, antwort.headers.get('X-Stationwizard-Diagnose') ?? ''];
}

describe('leseJsonKoerper', () => {
  it('liefert den gelesenen Inhalt', async () => {
    const ergebnis = await leseJsonKoerper(anfrage('{"a":1}'), 1024, CODES);
    expect(ergebnis).toEqual({ inhalt: { a: 1 } });
  });

  it('lehnt einen fremden Inhaltstyp mit dem Code des Moduls ab', async () => {
    const ergebnis = await leseJsonKoerper(anfrage('{}', 'text/plain'), 1024, CODES);
    expect(await diagnose(ergebnis)).toEqual([415, 'TEST_INHALTSTYP_UNGUELTIG']);
  });

  it('prüft den Inhaltstyp nicht, wenn das Modul keinen Code dafür nennt', async () => {
    const ergebnis = await leseJsonKoerper(anfrage('{"a":1}', 'text/plain'), 1024, {
      zuGross: CODES.zuGross,
      unlesbar: CODES.unlesbar,
    });
    expect(ergebnis).toEqual({ inhalt: { a: 1 } });
  });

  it('unterscheidet zu große von unlesbaren Anfragen', async () => {
    expect(
      await diagnose(await leseJsonKoerper(anfrage('"' + 'x'.repeat(64) + '"'), 16, CODES)),
    ).toEqual([413, 'TEST_ZU_GROSS']);
    expect(await diagnose(await leseJsonKoerper(anfrage('{kaputt'), 1024, CODES))).toEqual([
      400,
      'TEST_UNLESBAR',
    ]);
  });
});

describe('UUID_REGEX', () => {
  it('erkennt nur vollständige UUIDs', () => {
    expect(UUID_REGEX.test('0b6a4c1e-2f3d-4e5a-9b8c-7d6e5f4a3b2c')).toBe(true);
    expect(UUID_REGEX.test('0b6a4c1e-2f3d-4e5a-9b8c-7d6e5f4a3b2c/x')).toBe(false);
    expect(UUID_REGEX.test('../etc')).toBe(false);
  });
});
