import { describe, expect, it } from 'vitest';
import { ermittleAnzeigename, pruefeAnzeigename, verarbeiteAnzeigename } from '../src/anzeigename';
import { registriereZugriff } from '../src/benutzer';
import { FakeBenutzerDb } from './benutzer-db-fake';

const IDENTITAET = { email: 'max.mustermann@example.test' };

function anfrage(methode: string, koerper?: unknown): Request {
  return new Request('https://stationwizard.example.test/api/benutzer/anzeigename', {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: koerper === undefined ? undefined : JSON.stringify(koerper),
  });
}

describe('pruefeAnzeigename', () => {
  it('fasst Leerraum zusammen und lässt null zum Zurücksetzen zu', () => {
    expect(pruefeAnzeigename('  Max   Mustermann ')).toEqual({ name: 'Max Mustermann' });
    expect(pruefeAnzeigename(null)).toEqual({ name: null });
  });

  it('lehnt leere, zu lange und Steuerzeichen enthaltende Namen ab', () => {
    expect(pruefeAnzeigename('   ')).toBeNull();
    expect(pruefeAnzeigename('x'.repeat(61))).toBeNull();
    expect(pruefeAnzeigename('Max\nMuster')).toBeNull();
    expect(pruefeAnzeigename(5)).toBeNull();
  });
});

describe('verarbeiteAnzeigename', () => {
  it('sperrt ohne D1-Binding', async () => {
    const antwort = await verarbeiteAnzeigename(anfrage('GET'), {}, IDENTITAET);
    expect(antwort.status).toBe(503);
  });

  it('speichert den eigenen Namen und liest ihn zurück', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, IDENTITAET.email);
    const put = await verarbeiteAnzeigename(
      anfrage('PUT', { anzeigename: 'Maxi M.' }),
      { BENUTZER_DB: db as never },
      IDENTITAET,
    );
    expect(put.status).toBe(200);
    const get = await verarbeiteAnzeigename(
      anfrage('GET'),
      { BENUTZER_DB: db as never },
      IDENTITAET,
    );
    expect(await get.json()).toEqual({ anzeigename: 'Maxi M.' });
    expect(db.benutzer.get(IDENTITAET.email)?.rolle).toBeNull();
  });

  it('setzt mit null zurück und lehnt zusätzliche Felder ab', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, IDENTITAET.email);
    const umgebung = { BENUTZER_DB: db as never };
    await verarbeiteAnzeigename(anfrage('PUT', { anzeigename: 'Maxi' }), umgebung, IDENTITAET);
    await verarbeiteAnzeigename(anfrage('PUT', { anzeigename: null }), umgebung, IDENTITAET);
    expect(db.benutzer.get(IDENTITAET.email)?.anzeigename).toBeNull();
    const falsch = await verarbeiteAnzeigename(
      anfrage('PUT', { anzeigename: 'X', email: 'fremd@example.test' }),
      umgebung,
      IDENTITAET,
    );
    expect(falsch.status).toBe(400);
  });
});

describe('ermittleAnzeigename', () => {
  it('bevorzugt den eigenen Namen, sonst die Ableitung aus der E-Mail-Adresse', async () => {
    const db = new FakeBenutzerDb();
    await registriereZugriff(db as never, IDENTITAET.email);
    expect(await ermittleAnzeigename(db as never, IDENTITAET.email)).toBe('Max Mustermann');
    await verarbeiteAnzeigename(
      anfrage('PUT', { anzeigename: 'Maxi' }),
      { BENUTZER_DB: db as never },
      IDENTITAET,
    );
    expect(await ermittleAnzeigename(db as never, IDENTITAET.email)).toBe('Maxi');
    expect(await ermittleAnzeigename(undefined, IDENTITAET.email)).toBe('Max Mustermann');
  });
});
