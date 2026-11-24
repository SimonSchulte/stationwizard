import { describe, expect, it } from 'vitest';
import { verarbeiteSchadensmeldungVorlage } from '../src/schadensmeldung-vorlage';
import { SqliteD1 } from './sqlite-d1';

const IDENTITAET = { email: 'geprueft@example.test' };
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const URL_BASIS = 'https://stationwizard.example.test/api/vorlagen/schadensmeldung';

function umgebung() {
  return { BENUTZER_DB: new SqliteD1(['benutzer']) as never };
}

function hochladen(
  env: ReturnType<typeof umgebung>,
  optionen: { ifMatch?: string; name?: string; inhalt?: Uint8Array } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'X-Stationwizard-Dateiname': optionen.name ?? 'anlage-5.pdf',
  };
  if (optionen.ifMatch) headers['If-Match'] = optionen.ifMatch;
  else headers['If-None-Match'] = '*';
  return verarbeiteSchadensmeldungVorlage(
    new Request(URL_BASIS, { method: 'PUT', headers, body: optionen.inhalt ?? PDF }),
    env,
    IDENTITAET,
  );
}

describe('verarbeiteSchadensmeldungVorlage', () => {
  it('meldet eine fehlende Vorlage, speichert, liefert die Datei und ersetzt sie mit If-Match', async () => {
    const env = umgebung();
    const leer = await verarbeiteSchadensmeldungVorlage(new Request(URL_BASIS), env, IDENTITAET);
    expect(await leer.json()).toMatchObject({ vorhanden: false });

    const angelegt = await hochladen(env);
    expect(angelegt.status).toBeLessThan(300);
    const datei = await verarbeiteSchadensmeldungVorlage(
      new Request(`${URL_BASIS}/datei`),
      env,
      IDENTITAET,
    );
    expect(datei.headers.get('Content-Type')).toBe('application/pdf');
    expect([...new Uint8Array(await datei.arrayBuffer())]).toEqual([...PDF]);

    const ersetzt = await hochladen(env, { ifMatch: '"1"', name: 'neu.pdf' });
    expect(ersetzt.status).toBeLessThan(300);
    const veraltet = await hochladen(env, { ifMatch: '"1"' });
    expect(veraltet.status).toBe(412);
  });

  it('lehnt Dateien ohne PDF-Signatur und falsche Endungen ab', async () => {
    const env = umgebung();
    expect((await hochladen(env, { inhalt: new Uint8Array([1, 2, 3, 4, 5, 6]) })).status).toBe(400);
    expect((await hochladen(env, { name: 'anlage.docx' })).status).toBe(400);
  });

  it('sperrt ohne Datenbank', async () => {
    const antwort = await verarbeiteSchadensmeldungVorlage(new Request(URL_BASIS), {}, IDENTITAET);
    expect(antwort.status).toBe(503);
  });
});
