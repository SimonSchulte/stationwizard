/**
 * Minimaler D1-Ersatz für Tests: nur die Teilmenge von `D1Database`, die
 * `worker/src/fahrzeuge.ts` tatsächlich verwendet (`prepare().bind().run()
 * /.first()/.all()`), gegen zwei In-Memory-Tabellen. Kein echter SQL-Parser –
 * jede unterstützte Anweisung ist fest verdrahtet, damit ein Test niemals
 * über eine falsch nachgebildete Query hinwegtäuscht.
 */

interface FahrzeugZeile {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  fahrgestellnummer: string | null;
  eigentuemer: string;
  bemerkung: string;
  wartungstermine: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

interface AblesungZeile {
  id: string;
  fahrzeug_id: string;
  abgelesen_am: string;
  stand: number;
  erfasst_am: string;
  erfasst_von: string;
  quelle: string;
  korrigiert: string | null;
  bemerkung: string;
}

export class FakeFahrzeugeDb {
  fahrzeuge = new Map<string, FahrzeugZeile>();
  ablesungen: AblesungZeile[] = [];

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query.trim().replace(/\s+/g, ' '));
  }
}

class FakeStatement {
  private werte: unknown[] = [];

  constructor(
    private readonly db: FakeFahrzeugeDb,
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
    if (this.query.startsWith('INSERT INTO fahrzeuge')) {
      const [
        id,
        bezeichnung,
        funkrufname,
        kennzeichen,
        fahrgestellnummer,
        eigentuemer,
        bemerkung,
        wartungstermine,
        geaendert_am,
        geaendert_von,
      ] = this.werte as [
        string,
        string,
        string,
        string,
        string | null,
        string,
        string,
        string,
        string,
        string,
      ];
      if (this.db.fahrzeuge.has(id)) {
        throw new Error('UNIQUE constraint failed: fahrzeuge.id');
      }
      this.db.fahrzeuge.set(id, {
        id,
        bezeichnung,
        funkrufname,
        kennzeichen,
        fahrgestellnummer,
        eigentuemer,
        bemerkung,
        wartungstermine,
        geaendert_am,
        geaendert_von,
        version: 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('UPDATE fahrzeuge')) {
      const [
        bezeichnung,
        funkrufname,
        kennzeichen,
        fahrgestellnummer,
        eigentuemer,
        bemerkung,
        wartungstermine,
        geaendert_am,
        geaendert_von,
        id,
        erwarteteVersion,
      ] = this.werte as [
        string,
        string,
        string,
        string | null,
        string,
        string,
        string,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.fahrzeuge.get(id);
      if (!bestehend || bestehend.version !== erwarteteVersion) {
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      this.db.fahrzeuge.set(id, {
        ...bestehend,
        bezeichnung,
        funkrufname,
        kennzeichen,
        fahrgestellnummer,
        eigentuemer,
        bemerkung,
        wartungstermine,
        geaendert_am,
        geaendert_von,
        version: bestehend.version + 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('INSERT INTO ablesungen')) {
      const [
        id,
        fahrzeug_id,
        abgelesen_am,
        stand,
        erfasst_am,
        erfasst_von,
        quelle,
        korrigiert,
        bemerkung,
      ] = this.werte as [
        string,
        string,
        string,
        number,
        string,
        string,
        string,
        string | null,
        string,
      ];
      this.db.ablesungen.push({
        id,
        fahrzeug_id,
        abgelesen_am,
        stand,
        erfasst_am,
        erfasst_von,
        quelle,
        korrigiert,
        bemerkung,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    throw new Error(`FakeFahrzeugeDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.query.startsWith('SELECT * FROM fahrzeuge WHERE id = ?')) {
      const [id] = this.werte as [string];
      return (this.db.fahrzeuge.get(id) as T | undefined) ?? null;
    }
    if (this.query.startsWith('SELECT id FROM fahrzeuge WHERE id = ?')) {
      const [id] = this.werte as [string];
      return this.db.fahrzeuge.has(id) ? ({ id } as T) : null;
    }
    if (this.query.startsWith('SELECT id FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')) {
      const [id, fahrzeugId] = this.werte as [string, string];
      const treffer = this.db.ablesungen.find((a) => a.id === id && a.fahrzeug_id === fahrzeugId);
      return treffer ? ({ id: treffer.id } as T) : null;
    }
    throw new Error(`FakeFahrzeugeDb: unbekannte first()-Anweisung: ${this.query}`);
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }> {
    if (this.query.startsWith('SELECT * FROM fahrzeuge ORDER BY bezeichnung')) {
      const zeilen = [...this.db.fahrzeuge.values()].sort((a, b) =>
        a.bezeichnung.localeCompare(b.bezeichnung),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT * FROM ablesungen WHERE fahrzeug_id = ?')) {
      const [fahrzeugId] = this.werte as [string];
      const zeilen = this.db.ablesungen
        .filter((a) => a.fahrzeug_id === fahrzeugId)
        .sort((a, b) => a.abgelesen_am.localeCompare(b.abgelesen_am));
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeFahrzeugeDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
