/**
 * Minimaler D1-Ersatz für Tests: nur die Teilmenge von `D1Database`, die
 * `worker/src/angebotswesen.ts` tatsächlich verwendet (`prepare().bind().
 * run()/.first()/.all()`), gegen zwei In-Memory-Tabellen. Kein echter
 * SQL-Parser – jede unterstützte Anweisung ist fest verdrahtet, analog zu
 * `worker/tests/fahrzeug-db-fake.ts`.
 */

interface PreiskatalogZeile {
  id: string;
  bezeichnung: string;
  art: string;
  einzelpreis_cent: number;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

interface AngebotZeile {
  id: string;
  bezeichnung: string;
  auftraggeber: string;
  bemerkung: string;
  schichten: string;
  pauschalpreis_aktiv: number;
  pauschalpreis_cent: number | null;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

export class FakeAngebotswesenDb {
  preiskatalogEintraege = new Map<string, PreiskatalogZeile>();
  angebote = new Map<string, AngebotZeile>();

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query.trim().replace(/\s+/g, ' '));
  }
}

class FakeStatement {
  private werte: unknown[] = [];

  constructor(
    private readonly db: FakeAngebotswesenDb,
    private readonly query: string,
  ) {}

  bind(...werte: unknown[]): FakeStatement {
    this.werte = werte;
    return this;
  }

  async run<T = Record<string, unknown>>(): Promise<{
    success: true;
    meta: { changes: number };
    results: T[];
  }> {
    if (this.query.startsWith('INSERT INTO preiskatalog_eintraege')) {
      const [id, bezeichnung, art, einzelpreis_cent, geaendert_am, geaendert_von] = this.werte as [
        string,
        string,
        string,
        number,
        string,
        string,
      ];
      if (this.db.preiskatalogEintraege.has(id)) {
        throw new Error('UNIQUE constraint failed: preiskatalog_eintraege.id');
      }
      this.db.preiskatalogEintraege.set(id, {
        id,
        bezeichnung,
        art,
        einzelpreis_cent,
        geaendert_am,
        geaendert_von,
        version: 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('UPDATE preiskatalog_eintraege')) {
      const [
        bezeichnung,
        art,
        einzelpreis_cent,
        geaendert_am,
        geaendert_von,
        id,
        erwarteteVersion,
      ] = this.werte as [string, string, number, string, string, string, number];
      const bestehend = this.db.preiskatalogEintraege.get(id);
      if (!bestehend || bestehend.version !== erwarteteVersion) {
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      this.db.preiskatalogEintraege.set(id, {
        ...bestehend,
        bezeichnung,
        art,
        einzelpreis_cent,
        geaendert_am,
        geaendert_von,
        version: bestehend.version + 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('DELETE FROM preiskatalog_eintraege WHERE id = ?')) {
      const [id] = this.werte as [string];
      const vorhanden = this.db.preiskatalogEintraege.delete(id);
      return { success: true, meta: { changes: vorhanden ? 1 : 0 }, results: [] };
    }

    if (this.query.startsWith('INSERT INTO angebote')) {
      const [
        id,
        bezeichnung,
        auftraggeber,
        bemerkung,
        schichten,
        pauschalpreis_aktiv,
        pauschalpreis_cent,
        geaendert_am,
        geaendert_von,
      ] = this.werte as [
        string,
        string,
        string,
        string,
        string,
        number,
        number | null,
        string,
        string,
      ];
      if (this.db.angebote.has(id)) {
        throw new Error('UNIQUE constraint failed: angebote.id');
      }
      this.db.angebote.set(id, {
        id,
        bezeichnung,
        auftraggeber,
        bemerkung,
        schichten,
        pauschalpreis_aktiv,
        pauschalpreis_cent,
        geaendert_am,
        geaendert_von,
        version: 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('UPDATE angebote')) {
      const [
        bezeichnung,
        auftraggeber,
        bemerkung,
        schichten,
        pauschalpreis_aktiv,
        pauschalpreis_cent,
        geaendert_am,
        geaendert_von,
        id,
        erwarteteVersion,
      ] = this.werte as [
        string,
        string,
        string,
        string,
        number,
        number | null,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.angebote.get(id);
      if (!bestehend || bestehend.version !== erwarteteVersion) {
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      this.db.angebote.set(id, {
        ...bestehend,
        bezeichnung,
        auftraggeber,
        bemerkung,
        schichten,
        pauschalpreis_aktiv,
        pauschalpreis_cent,
        geaendert_am,
        geaendert_von,
        version: bestehend.version + 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('DELETE FROM angebote WHERE id = ?')) {
      const [id] = this.werte as [string];
      const vorhanden = this.db.angebote.delete(id);
      return { success: true, meta: { changes: vorhanden ? 1 : 0 }, results: [] };
    }

    throw new Error(`FakeAngebotswesenDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.query.startsWith('SELECT * FROM angebote WHERE id = ?')) {
      const [id] = this.werte as [string];
      return (this.db.angebote.get(id) as T | undefined) ?? null;
    }
    throw new Error(`FakeAngebotswesenDb: unbekannte first()-Anweisung: ${this.query}`);
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }> {
    if (this.query.startsWith('SELECT * FROM preiskatalog_eintraege ORDER BY bezeichnung')) {
      const zeilen = [...this.db.preiskatalogEintraege.values()].sort((a, b) =>
        a.bezeichnung.localeCompare(b.bezeichnung),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT * FROM angebote ORDER BY bezeichnung')) {
      const zeilen = [...this.db.angebote.values()].sort((a, b) =>
        a.bezeichnung.localeCompare(b.bezeichnung),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeAngebotswesenDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
