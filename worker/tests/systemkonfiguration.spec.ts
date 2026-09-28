import { describe, expect, it, vi } from 'vitest';
import {
  leseEinstellungen,
  verarbeiteSystemkonfiguration,
  type SystemkonfigurationKonfiguration,
} from '../src/systemkonfiguration';
import { FakeBenutzerDb } from './benutzer-db-fake';

const IDENTITAET = { email: 'person@example.test' };

/** Nur die Kilometer-Schlüssel; die übrigen bleiben auf ihrem Standard. */
const KILOMETER = {
  kmBerichtEmpfaenger: 'leitung@example.test',
  kmBerichtVersandweg: 'email-routing',
  kmBerichtBetreff: 'Kilometerstände',
};

/** Die Standardwerte der Materialeinstellungen, wie `leseEinstellungen` sie ergänzt. */
const MATERIAL_STANDARD = {
  materialBestellscheinEmpfaenger: '',
  materialMaengelLandEmpfaenger: '',
  materialMaengelSegEmpfaenger: '',
  materialVersandweg: 'email-routing',
  materialBetreff: 'Materialmeldung',
};

const VOLLSTAENDIG = { ...KILOMETER, ...MATERIAL_STANDARD };

function anfrage(init?: RequestInit): Request {
  return new Request('https://stationwizard.example.test/api/systemkonfiguration', init);
}

function speichern(koerper: unknown): Request {
  return anfrage({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(koerper),
  });
}

function umgebung(db: FakeBenutzerDb): SystemkonfigurationKonfiguration {
  return {
    BENUTZER_DB: db as never,
    MAIL_ABSENDER: 'berichte@example.test',
    MAIL_ROUTING: { send: vi.fn() } as never,
  };
}

interface Antwortform {
  einstellungen: Record<string, string>;
  versandwege: { weg: string; verfuegbar: boolean }[];
}

describe('verarbeiteSystemkonfiguration – ohne Konfiguration', () => {
  it('sperrt ohne D1-Binding statt mit einem Absturz', async () => {
    const antwort = await verarbeiteSystemkonfiguration(anfrage(), {}, IDENTITAET);
    expect(antwort.status).toBe(503);
  });
});

describe('GET /api/systemkonfiguration', () => {
  it('liefert die Standardwerte, solange nichts gespeichert ist', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      anfrage(),
      umgebung(new FakeBenutzerDb()),
      IDENTITAET,
    );

    expect(antwort.status).toBe(200);
    const inhalt = (await antwort.json()) as Antwortform;
    expect(inhalt.einstellungen['kmBerichtEmpfaenger']).toBe('');
    expect(inhalt.einstellungen['kmBerichtVersandweg']).toBe('email-routing');
    expect(inhalt.einstellungen['kmBerichtBetreff']).toBe('Kilometerstandsbericht');
  });

  it('meldet je bekanntem Weg, ob er eingerichtet ist', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      anfrage(),
      umgebung(new FakeBenutzerDb()),
      IDENTITAET,
    );

    const inhalt = (await antwort.json()) as Antwortform;
    expect(inhalt.versandwege).toEqual([
      { weg: 'email-routing', verfuegbar: true },
      // Ohne MAIL_API_TOKEN ist der HTTP-Weg ehrlich nicht verfügbar.
      { weg: 'resend', verfuegbar: false },
    ]);
  });

  it('meldet keinen Weg als verfügbar, solange keine Absenderadresse hinterlegt ist', async () => {
    const ohneAbsender = { ...umgebung(new FakeBenutzerDb()), MAIL_ABSENDER: undefined };

    const antwort = await verarbeiteSystemkonfiguration(anfrage(), ohneAbsender, IDENTITAET);

    const inhalt = (await antwort.json()) as Antwortform;
    expect(inhalt.versandwege.every((eintrag) => !eintrag.verfuegbar)).toBe(true);
  });

  it('gibt niemals Absenderadresse oder Token aus', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      anfrage(),
      { ...umgebung(new FakeBenutzerDb()), MAIL_API_TOKEN: 'geheim-123' },
      IDENTITAET,
    );

    const text = await antwort.text();
    expect(text).not.toContain('geheim-123');
    expect(text).not.toContain('berichte@example.test');
  });
});

describe('PUT /api/systemkonfiguration', () => {
  it('speichert alle Felder gemeinsam und gibt den neuen Stand zurück', async () => {
    const db = new FakeBenutzerDb();

    const antwort = await verarbeiteSystemkonfiguration(
      speichern(KILOMETER),
      umgebung(db),
      IDENTITAET,
    );

    expect(antwort.status).toBe(200);
    expect(((await antwort.json()) as Antwortform).einstellungen).toEqual(VOLLSTAENDIG);
    expect(db.systemkonfiguration.get('km_bericht_empfaenger')?.wert).toBe('leitung@example.test');
    expect(db.systemkonfiguration.get('km_bericht_empfaenger')?.geaendert_von).toBe(
      IDENTITAET.email,
    );
    expect(await leseEinstellungen(db as never)).toEqual(VOLLSTAENDIG);
  });

  it('nimmt eine leere Empfängeradresse als "noch nicht festgelegt" an', async () => {
    const db = new FakeBenutzerDb();

    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ ...KILOMETER, kmBerichtEmpfaenger: '  ' }),
      umgebung(db),
      IDENTITAET,
    );

    expect(antwort.status).toBe(200);
    expect((await leseEinstellungen(db as never)).kmBerichtEmpfaenger).toBe('');
  });

  it.each([
    ['eine unvollständige Adresse', { kmBerichtEmpfaenger: 'leitung@' }],
    ['einen unbekannten Versandweg', { kmBerichtVersandweg: 'smtp' }],
    ['einen leeren Betreff', { kmBerichtBetreff: '   ' }],
    ['einen Betreff mit Zeilenumbruch', { kmBerichtBetreff: 'Bericht\nBcc: fremd@example.test' }],
    ['einen zu langen Betreff', { kmBerichtBetreff: 'x'.repeat(121) }],
  ])('lehnt %s ab, ohne etwas zu speichern', async (_name, abweichung) => {
    const db = new FakeBenutzerDb();

    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ ...KILOMETER, ...abweichung }),
      umgebung(db),
      IDENTITAET,
    );

    expect(antwort.status).toBe(400);
    expect(db.systemkonfiguration.size).toBe(0);
  });

  it('lehnt einen unbekannten Schlüssel ab, statt ihn stillschweigend zu ignorieren', async () => {
    const db = new FakeBenutzerDb();

    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ ...KILOMETER, apiToken: 'geheim' }),
      umgebung(db),
      IDENTITAET,
    );

    expect(antwort.status).toBe(400);
    expect(db.systemkonfiguration.size).toBe(0);
  });

  it('lehnt einen fehlenden Inhaltstyp ab', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      anfrage({ method: 'PUT', body: JSON.stringify(VOLLSTAENDIG) }),
      umgebung(new FakeBenutzerDb()),
      IDENTITAET,
    );

    expect(antwort.status).toBe(415);
  });
});

describe('Rollenschranke der Materialeinstellungen', () => {
  function mitRolle(rolle: string | null): FakeBenutzerDb {
    const db = new FakeBenutzerDb();
    db.benutzer.set(IDENTITAET.email, {
      email: IDENTITAET.email,
      rolle,
      sonderrollen: '[]',
      erster_zugriff_am: '2026-01-01T00:00:00.000Z',
      letzter_zugriff_am: '2026-01-01T00:00:00.000Z',
      rolle_geaendert_am: null,
      rolle_geaendert_von: null,
    });
    return db;
  }

  it('lässt einen Helfer die Kilometer-Adresse weiterhin ändern', async () => {
    const db = mitRolle('helfer');

    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ kmBerichtEmpfaenger: 'neu@example.test' }),
      umgebung(db),
      IDENTITAET,
    );

    expect(antwort.status).toBe(200);
    expect((await leseEinstellungen(db as never)).kmBerichtEmpfaenger).toBe('neu@example.test');
  });

  it('verwehrt einem Helfer die Bestellschein-Adresse, ohne etwas zu speichern', async () => {
    const db = mitRolle('helfer');

    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ materialBestellscheinEmpfaenger: 'lager@example.test' }),
      umgebung(db),
      IDENTITAET,
    );

    expect(antwort.status).toBe(403);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('SYSTEMKONFIGURATION_ROLLE_FEHLT');
    expect(db.systemkonfiguration.has('material_bestellschein_empfaenger')).toBe(false);
  });

  it('verwehrt sie auch einer Person ganz ohne Rolle', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ materialVersandweg: 'resend' }),
      umgebung(new FakeBenutzerDb()),
      IDENTITAET,
    );

    expect(antwort.status).toBe(403);
  });

  it.each([['zugfuehrung'], ['gruppenfuehrung-sanitaet']])(
    'lässt %s die Materialeinstellungen ändern',
    async (rolle) => {
      const db = mitRolle(rolle);

      const antwort = await verarbeiteSystemkonfiguration(
        speichern({ materialBestellscheinEmpfaenger: 'lager@example.test' }),
        umgebung(db),
        IDENTITAET,
      );

      expect(antwort.status).toBe(200);
      expect((await leseEinstellungen(db as never)).materialBestellscheinEmpfaenger).toBe(
        'lager@example.test',
      );
    },
  );

  it('verwehrt sie der Gruppenführung einer anderen Gruppe', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ materialBetreff: 'Neuer Betreff' }),
      umgebung(mitRolle('gruppenfuehrung-betreuung')),
      IDENTITAET,
    );

    expect(antwort.status).toBe(403);
  });

  it('löst keine Rollenprüfung aus, wenn ein geschützter Schlüssel unverändert mitgesendet wird', async () => {
    const db = mitRolle('helfer');

    const antwort = await verarbeiteSystemkonfiguration(
      // Der Standardwert ist '' – der Schlüssel kommt vor, ändert sich aber nicht.
      speichern({ materialBestellscheinEmpfaenger: '', kmBerichtBetreff: 'Neu' }),
      umgebung(db),
      IDENTITAET,
    );

    expect(antwort.status).toBe(200);
    expect((await leseEinstellungen(db as never)).kmBerichtBetreff).toBe('Neu');
  });

  it('schreibt nur die tatsächlich geänderten Schlüssel', async () => {
    const db = mitRolle('helfer');

    await verarbeiteSystemkonfiguration(
      speichern({ kmBerichtBetreff: 'Nur dieser' }),
      umgebung(db),
      IDENTITAET,
    );

    expect([...db.systemkonfiguration.keys()]).toEqual(['km_bericht_betreff']);
  });

  it('sperrt zu, wenn die Rollenverwaltung nicht eingerichtet ist', async () => {
    const db = new FakeBenutzerDb();
    const ohneRollen = { ...umgebung(db), BENUTZER_DB: db as never };
    // Ohne Zeile in `benutzer` gilt: keine Rolle, also kein Zugriff.
    const antwort = await verarbeiteSystemkonfiguration(
      speichern({ materialMaengelLandEmpfaenger: 'land@example.test' }),
      ohneRollen,
      IDENTITAET,
    );

    expect(antwort.status).toBe(403);
  });
});

describe('leseEinstellungen', () => {
  it('fällt auf den Standard zurück, wenn ein gespeicherter Wert heute ungültig ist', async () => {
    const db = new FakeBenutzerDb();
    db.systemkonfiguration.set('km_bericht_versandweg', {
      schluessel: 'km_bericht_versandweg',
      wert: 'ein-entfallener-weg',
      geaendert_am: '2026-01-01T00:00:00.000Z',
      geaendert_von: IDENTITAET.email,
    });

    expect((await leseEinstellungen(db as never)).kmBerichtVersandweg).toBe('email-routing');
  });
});

describe('Methoden und Pfade', () => {
  it('lehnt andere Methoden mit Allow-Kopf ab', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      anfrage({ method: 'DELETE' }),
      umgebung(new FakeBenutzerDb()),
      IDENTITAET,
    );

    expect(antwort.status).toBe(405);
    expect(antwort.headers.get('Allow')).toBe('GET, PUT');
  });

  it('weist einen Pfad mit Query-String ab', async () => {
    const antwort = await verarbeiteSystemkonfiguration(
      new Request('https://stationwizard.example.test/api/systemkonfiguration?alles=1'),
      umgebung(new FakeBenutzerDb()),
      IDENTITAET,
    );

    expect(antwort.status).toBe(404);
  });
});
