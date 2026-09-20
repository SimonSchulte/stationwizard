import { describe, expect, it, vi } from 'vitest';
import {
  berichtAlsHtml,
  berichtAlsText,
  berlinerKalendertag,
  ladeKmBericht,
  verarbeiteKmBericht,
  type KmBerichtKonfiguration,
} from '../src/km-bericht';
import { FakeBenutzerDb } from './benutzer-db-fake';
import { FakeFahrzeugeDb } from './fahrzeug-db-fake';

const IDENTITAET = { email: 'person@example.test' };

function anfrage(pfad: string, init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

function fahrzeug(
  db: FakeFahrzeugeDb,
  id: string,
  bezeichnung: string,
  eigentuemer: string,
  kennzeichen = '',
): void {
  db.fahrzeuge.set(id, {
    id,
    bezeichnung,
    funkrufname: '',
    kennzeichen,
    fahrgestellnummer: null,
    eigentuemer,
    bemerkung: '',
    wartungstermine: '[]',
    geaendert_am: '2026-01-01T00:00:00.000Z',
    geaendert_von: IDENTITAET.email,
    version: 1,
  });
}

function ablesung(
  db: FakeFahrzeugeDb,
  id: string,
  fahrzeugId: string,
  abgelesenAm: string,
  stand: number,
  korrigiert: string | null = null,
): void {
  db.ablesungen.push({
    id,
    fahrzeug_id: fahrzeugId,
    abgelesen_am: abgelesenAm,
    stand,
    erfasst_am: `${abgelesenAm}T08:00:00.000Z`,
    erfasst_von: IDENTITAET.email,
    quelle: 'formular',
    korrigiert,
    bemerkung: '',
  });
}

describe('berlinerKalendertag', () => {
  it('bildet den lokalen Kalendertag ab, nicht den UTC-Tag', () => {
    // 23:30 Uhr UTC am 14.09. ist in Berlin bereits der 15.09.
    expect(berlinerKalendertag(new Date('2026-09-14T23:30:00Z'))).toBe('2026-09-15');
    // Und 00:30 UTC im Winter ist in Berlin noch derselbe Tag.
    expect(berlinerKalendertag(new Date('2026-01-15T00:30:00Z'))).toBe('2026-01-15');
  });
});

describe('ladeKmBericht', () => {
  it('führt jedes Fahrzeug mit letztem Stand und Abstand zum Stichtag', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'MTW', 'land-nrw', 'K-XY 123');
    ablesung(db, 'a1', 'a', '2025-12-20', 10_000);
    ablesung(db, 'a2', 'a', '2026-06-01', 12_000);

    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    expect(bericht.jahr).toBe(2026);
    expect(bericht.zeilen).toHaveLength(1);
    const zeile = bericht.zeilen[0]!;
    // Die Übersicht verlinkt über diese ID, ohne die Fahrzeugliste zu joinen.
    expect(zeile.id).toBe('a');
    expect(zeile.letzterStand).toBe(12_000);
    expect(zeile.abgelesenAm).toBe('2026-06-01');
    expect(zeile.tageSeitAblesung).toBe(14);
    // 150 km/Monat * 12 Monate, davon 2000 gefahren.
    expect(zeile.sollKm).toBe(1800);
    expect(zeile.istKm).toBe(2000);
    expect(zeile.restKm).toBe(0);
    expect(zeile.unvollstaendig).toBe(false);
  });

  it('meldet ein Fahrzeug ohne jede Ablesung statt es wegzulassen', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'GW-San', 'bund');

    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    expect(bericht.ohneAblesung).toBe(1);
    expect(bericht.zeilen[0]!.letzterStand).toBeNull();
    expect(bericht.zeilen[0]!.istKm).toBeNull();
    expect(bericht.zeilen[0]!.restKm).toBeNull();
  });

  it('markiert einen ersatzweise benutzten Startstand als unvollständig', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'MTW', 'land-nrw');
    ablesung(db, 'a1', 'a', '2026-03-01', 5_000);

    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    expect(bericht.zeilen[0]!.unvollstaendig).toBe(true);
    expect(bericht.zeilen[0]!.istKm).toBe(0);
  });

  it('wertet eine auf den 1.1. datierte erste Ablesung als vollwertigen Startstand', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'MTW', 'land-nrw');
    ablesung(db, 'a1', 'a', '2026-01-01', 5_000);
    ablesung(db, 'a2', 'a', '2026-06-01', 6_900);

    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    expect(bericht.zeilen[0]!.unvollstaendig).toBe(false);
    expect(bericht.zeilen[0]!.istKm).toBe(1900);
  });

  it('ignoriert eine Ablesung, auf die eine Korrektur verweist', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'MTW', 'land-nrw');
    ablesung(db, 'a1', 'a', '2026-01-01', 5_000);
    ablesung(db, 'a2', 'a', '2026-06-01', 99_999);
    ablesung(db, 'a3', 'a', '2026-06-01', 6_000, 'a2');

    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    expect(bericht.zeilen[0]!.letzterStand).toBe(6_000);
  });

  it('zählt ein Fahrzeug der Organisation nie als unter Soll', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'PKW', 'organisation');
    ablesung(db, 'a1', 'a', '2026-01-01', 1_000);

    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    expect(bericht.zeilen[0]!.sollKm).toBe(0);
    expect(bericht.unterSoll).toBe(0);
  });

  it('zählt ein Fahrzeug ohne Ablesung als unter Soll', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'MTW', 'land-nrw');

    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    expect(bericht.unterSoll).toBe(1);
  });
});

describe('Berichtsdarstellung', () => {
  it('maskiert Fahrzeugtexte im HTML statt sie als Markup einzusetzen', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', '<script>böse</script>', 'bund');
    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    const html = berichtAlsHtml(bericht);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('nennt im Text Stichtag, Anzahl und Bilanz', async () => {
    const db = new FakeFahrzeugeDb();
    fahrzeug(db, 'a', 'MTW', 'land-nrw');
    ablesung(db, 'a1', 'a', '2026-01-01', 1_000);
    const bericht = await ladeKmBericht(db as never, '2026-06-15');

    const text = berichtAlsText(bericht);

    expect(text).toContain('15.06.2026');
    expect(text).toContain('MTW');
    expect(text).toContain('1.800 km');
  });

  it('kommt ohne Fahrzeuge aus, ohne eine leere Tabelle zu bauen', async () => {
    const bericht = await ladeKmBericht(new FakeFahrzeugeDb() as never, '2026-06-15');

    expect(berichtAlsHtml(bericht)).toContain('keine Fahrzeuge erfasst');
    expect(berichtAlsText(bericht)).toContain('keine Fahrzeuge erfasst');
  });
});

function umgebungMit(
  fahrzeugeDb: FakeFahrzeugeDb,
  benutzerDb: FakeBenutzerDb,
  senden = vi.fn().mockResolvedValue({ messageId: 'x' }),
): KmBerichtKonfiguration & { senden: typeof senden } {
  return {
    FAHRZEUGE_DB: fahrzeugeDb as never,
    BENUTZER_DB: benutzerDb as never,
    MAIL_ABSENDER: 'berichte@example.test',
    MAIL_ROUTING: { send: senden } as never,
    senden,
  };
}

async function empfaengerSetzen(db: FakeBenutzerDb, adresse: string): Promise<void> {
  db.systemkonfiguration.set('km_bericht_empfaenger', {
    schluessel: 'km_bericht_empfaenger',
    wert: adresse,
    geaendert_am: '2026-01-01T00:00:00.000Z',
    geaendert_von: IDENTITAET.email,
  });
}

describe('verarbeiteKmBericht', () => {
  it('sperrt ohne Fahrzeugdatenbank statt mit einem Absturz', async () => {
    const antwort = await verarbeiteKmBericht(anfrage('/api/fahrzeuge/km-bericht'), {}, IDENTITAET);
    expect(antwort.status).toBe(503);
  });

  it('liefert die Vorschau als JSON, ohne eine Mail zu senden', async () => {
    const fahrzeugeDb = new FakeFahrzeugeDb();
    fahrzeug(fahrzeugeDb, 'a', 'MTW', 'land-nrw');
    const umgebung = umgebungMit(fahrzeugeDb, new FakeBenutzerDb());

    const antwort = await verarbeiteKmBericht(
      anfrage('/api/fahrzeuge/km-bericht'),
      umgebung,
      IDENTITAET,
    );

    expect(antwort.status).toBe(200);
    expect(((await antwort.json()) as { zeilen: unknown[] }).zeilen).toHaveLength(1);
    expect(umgebung.senden).not.toHaveBeenCalled();
  });

  it('lehnt POST auf die Vorschau und GET auf den Versand ab', async () => {
    const umgebung = umgebungMit(new FakeFahrzeugeDb(), new FakeBenutzerDb());

    expect(
      (
        await verarbeiteKmBericht(
          anfrage('/api/fahrzeuge/km-bericht', { method: 'POST' }),
          umgebung,
          IDENTITAET,
        )
      ).status,
    ).toBe(405);
    expect(
      (await verarbeiteKmBericht(anfrage('/api/fahrzeuge/km-bericht/senden'), umgebung, IDENTITAET))
        .status,
    ).toBe(405);
    expect(umgebung.senden).not.toHaveBeenCalled();
  });

  it('sendet an die hinterlegte Adresse und meldet, was gesendet wurde', async () => {
    const fahrzeugeDb = new FakeFahrzeugeDb();
    fahrzeug(fahrzeugeDb, 'a', 'MTW', 'land-nrw');
    const benutzerDb = new FakeBenutzerDb();
    await empfaengerSetzen(benutzerDb, 'leitung@example.test');
    const umgebung = umgebungMit(fahrzeugeDb, benutzerDb);

    const antwort = await verarbeiteKmBericht(
      anfrage('/api/fahrzeuge/km-bericht/senden', { method: 'POST' }),
      umgebung,
      IDENTITAET,
    );

    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toMatchObject({
      gesendetAn: 'leitung@example.test',
      gesendetVon: IDENTITAET.email,
      anzahlFahrzeuge: 1,
      versandweg: 'email-routing',
    });
    expect(umgebung.senden).toHaveBeenCalledTimes(1);
    const nachricht = umgebung.senden.mock.calls[0]![0] as {
      to: string;
      from: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(nachricht.to).toBe('leitung@example.test');
    expect(nachricht.from).toBe('berichte@example.test');
    expect(nachricht.subject).toContain('Kilometerstandsbericht');
    expect(nachricht.html).toContain('MTW');
    expect(nachricht.text).toContain('MTW');
  });

  it('sendet nichts ohne hinterlegte Empfängeradresse', async () => {
    const umgebung = umgebungMit(new FakeFahrzeugeDb(), new FakeBenutzerDb());

    const antwort = await verarbeiteKmBericht(
      anfrage('/api/fahrzeuge/km-bericht/senden', { method: 'POST' }),
      umgebung,
      IDENTITAET,
    );

    expect(antwort.status).toBe(409);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('KM_BERICHT_EMPFAENGER_FEHLT');
    expect(umgebung.senden).not.toHaveBeenCalled();
  });

  it('meldet einen nicht eingerichteten Versandweg als 503, nicht als Erfolg', async () => {
    const benutzerDb = new FakeBenutzerDb();
    await empfaengerSetzen(benutzerDb, 'leitung@example.test');
    const umgebung = umgebungMit(new FakeFahrzeugeDb(), benutzerDb);
    delete umgebung.MAIL_ROUTING;

    const antwort = await verarbeiteKmBericht(
      anfrage('/api/fahrzeuge/km-bericht/senden', { method: 'POST' }),
      umgebung,
      IDENTITAET,
    );

    expect(antwort.status).toBe(503);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'MAIL_VERSANDWEG_NICHT_EINGERICHTET',
    );
  });

  it('gibt einen Upstream-Fehler als festen Code weiter, ohne dessen Text', async () => {
    const benutzerDb = new FakeBenutzerDb();
    await empfaengerSetzen(benutzerDb, 'leitung@example.test');
    const senden = vi.fn().mockRejectedValue(new Error('550 leitung@example.test unverified'));
    const umgebung = umgebungMit(new FakeFahrzeugeDb(), benutzerDb, senden);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const antwort = await verarbeiteKmBericht(
      anfrage('/api/fahrzeuge/km-bericht/senden', { method: 'POST' }),
      umgebung,
      IDENTITAET,
    );

    expect(antwort.status).toBe(502);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('MAIL_VERSAND_FEHLGESCHLAGEN');
    expect(await antwort.text()).not.toContain('unverified');
  });

  it('unterscheidet die Ursachen des Resend-Wegs im Diagnosecode', async () => {
    // Die Oberfläche sieht vom Worker nur Status und Diagnosecode. Fielen alle
    // Ursachen auf denselben Code, wäre ein abgelehntes Token ohne Zugriff auf
    // die Worker-Logs nicht von einem Netzwerkausfall zu unterscheiden.
    const faelle: [unknown, string, number][] = [
      [new TypeError('connection failed'), 'MAIL_VERSAND_NICHT_ERREICHBAR', 502],
      [{ ok: false, status: 403, body: null }, 'MAIL_VERSAND_ZUGANG_ABGELEHNT', 502],
      [{ ok: false, status: 302, body: null }, 'MAIL_VERSAND_UMLEITUNG', 502],
    ];
    vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const [ergebnis, code, status] of faelle) {
      const benutzerDb = new FakeBenutzerDb();
      await empfaengerSetzen(benutzerDb, 'leitung@example.test');
      benutzerDb.systemkonfiguration.set('km_bericht_versandweg', {
        schluessel: 'km_bericht_versandweg',
        wert: 'resend',
        geaendert_am: '2026-01-01T00:00:00.000Z',
        geaendert_von: IDENTITAET.email,
      });
      const umgebung = {
        ...umgebungMit(new FakeFahrzeugeDb(), benutzerDb),
        MAIL_API_TOKEN: 'geheimes-token',
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(
          ergebnis instanceof Error
            ? () => Promise.reject(ergebnis)
            : () => Promise.resolve(ergebnis as Response),
        ),
      );

      const antwort = await verarbeiteKmBericht(
        anfrage('/api/fahrzeuge/km-bericht/senden', { method: 'POST' }),
        umgebung,
        IDENTITAET,
      );

      expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(code);
      expect(antwort.status).toBe(status);
    }
    vi.unstubAllGlobals();
  });

  it('weist einen Pfad mit Query-String ab', async () => {
    const antwort = await verarbeiteKmBericht(
      anfrage('/api/fahrzeuge/km-bericht?fahrzeug=1'),
      umgebungMit(new FakeFahrzeugeDb(), new FakeBenutzerDb()),
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });
});
