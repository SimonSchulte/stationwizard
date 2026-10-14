import { describe, expect, it } from 'vitest';
import { verarbeiteEhrungsantragVorlage } from '../src/ehrungsantrag-vorlage';

const IDENTITAET = { email: 'geprueft@example.test' };

/**
 * Die Ablage ist mit der Führerschein-Vorlage gemeinsam (`datei-vorlage.ts`) und dort
 * ausführlich getestet; hier nur, was die PDF-Art unterscheidet: eigene Tabelle, eigener Pfad,
 * PDF-Signatur, Dateiendung und Inhaltstyp.
 */
class FakeDb {
  zeile: { dateiname: string; inhalt: ArrayBuffer; version: number } | null = null;
  anweisungen: string[] = [];

  prepare(sql: string) {
    const anweisung = sql.trim().replace(/\s+/g, ' ');
    this.anweisungen.push(anweisung);
    let werte: unknown[] = [];
    const gebunden = {
      bind: (...w: unknown[]) => {
        werte = w;
        return gebunden;
      },
      first: async <T>() => {
        if (!this.zeile) return null;
        if (anweisung.startsWith('SELECT dateiname, inhalt, version FROM ehrungsantrag_vorlage')) {
          return {
            dateiname: this.zeile.dateiname,
            inhalt: [...new Uint8Array(this.zeile.inhalt)],
            version: this.zeile.version,
          } as T;
        }
        throw new Error(`Unerwartete Anweisung: ${anweisung}`);
      },
      run: async () => {
        if (anweisung.startsWith('INSERT INTO ehrungsantrag_vorlage')) {
          const [, dateiname, inhalt] = werte as [string, string, ArrayBuffer];
          this.zeile = { dateiname, inhalt, version: 1 };
          return { success: true, meta: { changes: 1 }, results: [] };
        }
        throw new Error(`Unerwartete Anweisung: ${anweisung}`);
      },
    };
    return gebunden;
  }
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function hochladen(
  db: FakeDb,
  inhalt: Uint8Array,
  dateiname = 'antrag.pdf',
  typ = 'application/pdf',
) {
  return verarbeiteEhrungsantragVorlage(
    new Request('https://stationwizard.example.test/api/personal/ehrungsantrag-vorlage', {
      method: 'PUT',
      headers: {
        'Content-Type': typ,
        'X-Stationwizard-Dateiname': dateiname,
        'If-None-Match': '*',
      },
      body: inhalt,
    }),
    { BENUTZER_DB: db as unknown as D1Database },
    IDENTITAET,
  );
}

describe('Ehrungsantrag-Vorlage', () => {
  it('legt ein PDF in der eigenen Tabelle an und liefert es unverändert zurück', async () => {
    const db = new FakeDb();
    expect((await hochladen(db, PDF)).status).toBe(201);
    expect(db.anweisungen.some((a) => a.includes('fuehrerschein_vorlage'))).toBe(false);
    const antwort = await verarbeiteEhrungsantragVorlage(
      new Request('https://stationwizard.example.test/api/personal/ehrungsantrag-vorlage/datei'),
      { BENUTZER_DB: db as unknown as D1Database },
      IDENTITAET,
    );
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe('application/pdf');
    expect(new Uint8Array(await antwort.arrayBuffer())).toEqual(PDF);
  });

  it('lehnt Inhalt ohne PDF-Signatur, falsche Endung und falschen Typ mit eigenen Codes ab', async () => {
    const db = new FakeDb();
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]);
    const ungueltig = await hochladen(db, zip);
    expect(ungueltig.status).toBe(400);
    expect(ungueltig.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EHRUNGSANTRAG_VORLAGE_UNGUELTIG',
    );
    expect((await hochladen(db, PDF, 'antrag.docx')).headers.get('X-Stationwizard-Diagnose')).toBe(
      'EHRUNGSANTRAG_VORLAGE_DATEINAME_UNGUELTIG',
    );
    expect((await hochladen(db, PDF, 'antrag.pdf', 'text/html')).status).toBe(415);
    expect(db.zeile).toBeNull();
  });

  it('meldet 503 ohne BENUTZER_DB', async () => {
    const antwort = await verarbeiteEhrungsantragVorlage(
      new Request('https://stationwizard.example.test/api/personal/ehrungsantrag-vorlage'),
      {},
      IDENTITAET,
    );
    expect(antwort.status).toBe(503);
    expect(antwort.headers.get('X-Stationwizard-Diagnose')).toBe(
      'EHRUNGSANTRAG_VORLAGE_NICHT_EINGERICHTET',
    );
  });
});
