import { describe, expect, it } from 'vitest';
import { verarbeiteFuehrerscheinVorlage } from '../src/fuehrerschein-vorlage';

const IDENTITAET = { email: 'geprueft@example.test' };
const DOCX_INHALTSTYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Nur die vier Anweisungen aus fuehrerschein-vorlage.ts, gegen eine In-Memory-Zeile. */
class FakeDb {
  zeile: {
    dateiname: string;
    inhalt: ArrayBuffer;
    version: number;
    geaendert_am: string;
    geaendert_von: string;
  } | null = null;

  prepare(sql: string) {
    const anweisung = sql.trim().replace(/\s+/g, ' ');
    let werte: unknown[] = [];
    const gebunden = {
      bind: (...w: unknown[]) => {
        werte = w;
        return gebunden;
      },
      first: async <T>() => {
        if (!this.zeile) return null;
        if (anweisung.startsWith('SELECT dateiname, version')) {
          return {
            dateiname: this.zeile.dateiname,
            version: this.zeile.version,
            geaendert_am: this.zeile.geaendert_am,
            geaendert_von: this.zeile.geaendert_von,
          } as T;
        }
        if (anweisung.startsWith('SELECT dateiname, inhalt')) {
          return {
            dateiname: this.zeile.dateiname,
            inhalt: this.zeile.inhalt,
            version: this.zeile.version,
          } as T;
        }
        throw new Error(`Unerwartete Anweisung: ${anweisung}`);
      },
      run: async () => {
        if (anweisung.startsWith('INSERT INTO fuehrerschein_vorlage')) {
          if (this.zeile) throw new Error('UNIQUE constraint failed: fuehrerschein_vorlage.id');
          const [, dateiname, inhalt, geaendertAm, geaendertVon] = werte as [
            string,
            string,
            ArrayBuffer,
            string,
            string,
          ];
          this.zeile = {
            dateiname,
            inhalt,
            version: 1,
            geaendert_am: geaendertAm,
            geaendert_von: geaendertVon,
          };
          return { success: true, meta: { changes: 1 }, results: [] };
        }
        if (anweisung.startsWith('UPDATE fuehrerschein_vorlage')) {
          const [dateiname, inhalt, geaendertAm, geaendertVon, , erwartet] = werte as [
            string,
            ArrayBuffer,
            string,
            string,
            string,
            number,
          ];
          if (!this.zeile || this.zeile.version !== erwartet) {
            return { success: true, meta: { changes: 0 }, results: [] };
          }
          this.zeile = {
            dateiname,
            inhalt,
            version: this.zeile.version + 1,
            geaendert_am: geaendertAm,
            geaendert_von: geaendertVon,
          };
          return { success: true, meta: { changes: 1 }, results: [] };
        }
        throw new Error(`Unerwartete Anweisung: ${anweisung}`);
      },
    };
    return gebunden;
  }
}

function anfrage(pfad: string, init?: RequestInit): Request {
  return new Request(`https://stationwizard.example.test${pfad}`, init);
}

function docxBytes(): Uint8Array {
  // Nur die ZIP-Magic-Bytes; mehr prüft istZip() nicht, und der Inhalt ist
  // für diese Tests fachlich irrelevant.
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
}

function hochladen(
  db: D1Database,
  bedingung: Record<string, string>,
  dateiname = 'fahrerlaubnis.docx',
) {
  return verarbeiteFuehrerscheinVorlage(
    anfrage('/api/personal/fuehrerschein-vorlage', {
      method: 'PUT',
      headers: {
        'Content-Type': DOCX_INHALTSTYP,
        'X-Stationwizard-Dateiname': dateiname,
        ...bedingung,
      },
      body: docxBytes(),
    }),
    { BENUTZER_DB: db },
    IDENTITAET,
  );
}

describe('Führerschein-Vorlage: fehlende Einrichtung', () => {
  it('meldet 503 ohne BENUTZER_DB', async () => {
    const antwort = await verarbeiteFuehrerscheinVorlage(
      anfrage('/api/personal/fuehrerschein-vorlage'),
      {},
      IDENTITAET,
    );
    expect(antwort.status).toBe(503);
  });
});

describe('Führerschein-Vorlage: Metadaten', () => {
  it('meldet vorhanden: false ohne hinterlegte Vorlage', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await verarbeiteFuehrerscheinVorlage(
      anfrage('/api/personal/fuehrerschein-vorlage'),
      { BENUTZER_DB: db },
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({
      vorhanden: false,
      dateiname: null,
      version: null,
      geaendertAm: null,
      geaendertVon: null,
    });
    expect(antwort.headers.get('ETag')).toBeNull();
  });
});

describe('Führerschein-Vorlage: Anlegen', () => {
  it('legt mit If-None-Match: * an und liefert Version 1', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await hochladen(db, { 'If-None-Match': '*' });
    expect(antwort.status).toBe(201);
    expect(antwort.headers.get('ETag')).toBe('"1"');
    const koerper = await antwort.json();
    expect(koerper).toMatchObject({ vorhanden: true, dateiname: 'fahrerlaubnis.docx', version: 1 });
  });

  it('lehnt eine zweite Anlage ab, wenn bereits eine Vorlage vorliegt', async () => {
    const db = new FakeDb() as unknown as D1Database;
    await hochladen(db, { 'If-None-Match': '*' });
    const antwort = await hochladen(db, { 'If-None-Match': '*' });
    expect(antwort.status).toBe(412);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('FUEHRERSCHEIN_VORLAGE_KONFLIKT');
  });

  it('verlangt If-Match oder If-None-Match', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await hochladen(db, {});
    expect(antwort.status).toBe(428);
  });

  it('lehnt einen ungültigen Dateinamen ab', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await hochladen(db, { 'If-None-Match': '*' }, 'ohne-endung');
    expect(antwort.status).toBe(400);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'FUEHRERSCHEIN_VORLAGE_DATEINAME_UNGUELTIG',
    );
  });

  it('lehnt einen Inhalt ohne ZIP-Signatur ab', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await verarbeiteFuehrerscheinVorlage(
      anfrage('/api/personal/fuehrerschein-vorlage', {
        method: 'PUT',
        headers: {
          'Content-Type': DOCX_INHALTSTYP,
          'X-Stationwizard-Dateiname': 'fahrerlaubnis.docx',
          'If-None-Match': '*',
        },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      { BENUTZER_DB: db },
      IDENTITAET,
    );
    expect(antwort.status).toBe(400);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('FUEHRERSCHEIN_VORLAGE_UNGUELTIG');
  });
});

describe('Führerschein-Vorlage: Ersetzen', () => {
  it('ersetzt mit passendem If-Match und erhöht die Version', async () => {
    const db = new FakeDb() as unknown as D1Database;
    await hochladen(db, { 'If-None-Match': '*' });
    const antwort = await hochladen(db, { 'If-Match': '"1"' }, 'neue-fassung.docx');
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('ETag')).toBe('"2"');
    expect(await antwort.json()).toMatchObject({ dateiname: 'neue-fassung.docx', version: 2 });
  });

  it('meldet 412 bei veralteter Version', async () => {
    const db = new FakeDb() as unknown as D1Database;
    await hochladen(db, { 'If-None-Match': '*' });
    const antwort = await hochladen(db, { 'If-Match': '"9"' });
    expect(antwort.status).toBe(412);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe('FUEHRERSCHEIN_VORLAGE_KONFLIKT');
  });

  it('meldet 412 statt 404, wenn noch gar keine Vorlage existiert', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await hochladen(db, { 'If-Match': '"1"' });
    expect(antwort.status).toBe(412);
  });
});

describe('Führerschein-Vorlage: Datei', () => {
  it('liefert 404 ohne hinterlegte Vorlage', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await verarbeiteFuehrerscheinVorlage(
      anfrage('/api/personal/fuehrerschein-vorlage/datei'),
      { BENUTZER_DB: db },
      IDENTITAET,
    );
    expect(antwort.status).toBe(404);
  });

  it('liefert den Rohinhalt mit Content-Type und ETag', async () => {
    const db = new FakeDb() as unknown as D1Database;
    await hochladen(db, { 'If-None-Match': '*' });
    const antwort = await verarbeiteFuehrerscheinVorlage(
      anfrage('/api/personal/fuehrerschein-vorlage/datei'),
      { BENUTZER_DB: db },
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe(DOCX_INHALTSTYP);
    expect(antwort.headers.get('Content-Disposition')).toContain('fahrerlaubnis.docx');
    expect(antwort.headers.get('ETag')).toBe('"1"');
    const gelesen = new Uint8Array(await antwort.arrayBuffer());
    expect([...gelesen]).toEqual([...docxBytes()]);
  });

  it('lehnt eine andere Methode als GET ab', async () => {
    const db = new FakeDb() as unknown as D1Database;
    const antwort = await verarbeiteFuehrerscheinVorlage(
      anfrage('/api/personal/fuehrerschein-vorlage/datei', { method: 'DELETE' }),
      { BENUTZER_DB: db },
      IDENTITAET,
    );
    expect(antwort.status).toBe(405);
  });
});
