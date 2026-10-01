/**
 * Minimaler D1-Ersatz für `worker/src/kalender-planung.ts`: genau die
 * Anweisungen, die das Modul verwendet, fest verdrahtet gegen eine
 * In-Memory-Tabelle – analog zu `angebotswesen-db-fake.ts`. `batch()` ist wie
 * bei D1 atomar: scheitert eine Anweisung, bleibt der vorherige Stand erhalten.
 */

interface JahrZeile {
  jahr: number;
  titel: string;
  termine: string;
  ideen: string;
  kats_themen: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

interface Ergebnis<T> {
  success: true;
  meta: { changes: number };
  results: T[];
}

export class FakeKalenderDb {
  jahre = new Map<number, JahrZeile>();
  /** Zählt Schreibanweisungen, um „nichts geschrieben“ belegen zu können. */
  schreibvorgaenge = 0;

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query.trim().replace(/\s+/g, ' '));
  }

  async batch(anweisungen: FakeStatement[]): Promise<Ergebnis<unknown>[]> {
    const jahre = new Map(this.jahre);
    try {
      const ergebnisse: Ergebnis<unknown>[] = [];
      for (const anweisung of anweisungen) {
        ergebnisse.push(anweisung.istLesend() ? await anweisung.all() : await anweisung.run());
      }
      return ergebnisse;
    } catch (fehler) {
      this.jahre = jahre;
      throw fehler;
    }
  }
}

class FakeStatement {
  private werte: unknown[] = [];

  constructor(
    private readonly db: FakeKalenderDb,
    private readonly query: string,
  ) {}

  bind(...werte: unknown[]): FakeStatement {
    this.werte = werte;
    return this;
  }

  istLesend(): boolean {
    return this.query.startsWith('SELECT');
  }

  async run(): Promise<Ergebnis<never>> {
    const w = this.werte;
    if (this.query.startsWith('INSERT INTO kalender_jahre')) {
      const [jahr, titel, termine, ideen, kats_themen, geaendert_am, geaendert_von] = w as [
        number,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      if (this.db.jahre.has(jahr)) {
        throw new Error('UNIQUE constraint failed: kalender_jahre.jahr');
      }
      this.db.schreibvorgaenge++;
      this.db.jahre.set(jahr, {
        jahr,
        titel,
        termine,
        ideen,
        kats_themen,
        geaendert_am,
        geaendert_von,
        version: 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }
    if (this.query.startsWith('UPDATE kalender_jahre')) {
      const [titel, termine, ideen, kats_themen, geaendert_am, geaendert_von, jahr, version] =
        w as [string, string, string, string, string, string, number, number];
      const zeile = this.db.jahre.get(jahr);
      if (!zeile || zeile.version !== version) {
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      this.db.schreibvorgaenge++;
      this.db.jahre.set(jahr, {
        jahr,
        titel,
        termine,
        ideen,
        kats_themen,
        geaendert_am,
        geaendert_von,
        version: version + 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }
    throw new Error(`Nicht unterstützte Anweisung: ${this.query}`);
  }

  async all<T>(): Promise<Ergebnis<T>> {
    if (this.query === 'SELECT * FROM kalender_jahre ORDER BY jahr') {
      const zeilen = [...this.db.jahre.values()].sort((a, b) => a.jahr - b.jahr);
      return { success: true, meta: { changes: 0 }, results: zeilen as T[] };
    }
    throw new Error(`Nicht unterstützte Abfrage: ${this.query}`);
  }

  async first<T>(): Promise<T | null> {
    if (this.query === 'SELECT COUNT(*) AS anzahl FROM kalender_jahre') {
      return { anzahl: this.db.jahre.size } as T;
    }
    throw new Error(`Nicht unterstützte Abfrage: ${this.query}`);
  }
}
