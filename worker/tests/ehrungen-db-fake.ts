/**
 * Minimaler D1-Ersatz für `worker/src/ehrungen.ts`: nur die dort verwendeten,
 * fest verdrahteten Anweisungen gegen eine In-Memory-Tabelle (kein SQL-Parser),
 * analog zu `angebotswesen-db-fake.ts`. Bildet den eindeutigen `schluessel`
 * der Migration 0014 nach.
 */
export interface EhrungZeile {
  id: string;
  nachname: string;
  vorname: string;
  schluessel: string;
  stunden: number;
  eintrittsdatum: string | null;
  besondere_verdienste: number;
  erhalten: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

interface Ergebnis<T> {
  success: true;
  meta: { changes: number };
  results: T[];
}

export class FakeEhrungenDb {
  zeilen = new Map<string, EhrungZeile>();
  batchAufrufe = 0;

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query.trim().replace(/\s+/g, ' '));
  }

  async batch(anweisungen: FakeStatement[]): Promise<Ergebnis<unknown>[]> {
    this.batchAufrufe++;
    const ergebnisse: Ergebnis<unknown>[] = [];
    for (const anweisung of anweisungen) ergebnisse.push(await anweisung.run());
    return ergebnisse;
  }
}

class FakeStatement {
  private werte: unknown[] = [];

  constructor(
    private readonly db: FakeEhrungenDb,
    private readonly query: string,
  ) {}

  bind(...werte: unknown[]): FakeStatement {
    this.werte = werte;
    return this;
  }

  async all<T>(): Promise<Ergebnis<T>> {
    if (this.query.startsWith('SELECT * FROM ehrungen_personen')) {
      const zeilen = [...this.db.zeilen.values()];
      if (this.query.includes('ORDER BY nachname, vorname')) {
        zeilen.sort(
          (a, b) => a.nachname.localeCompare(b.nachname) || a.vorname.localeCompare(b.vorname),
        );
      }
      return { success: true, meta: { changes: 0 }, results: zeilen as T[] };
    }
    throw new Error(`Nicht unterstützte Abfrage: ${this.query}`);
  }

  async first<T>(): Promise<T | null> {
    if (this.query.startsWith('SELECT version FROM ehrungen_personen WHERE id = ?')) {
      const zeile = this.db.zeilen.get(this.werte[0] as string);
      return (zeile ? { version: zeile.version } : null) as T | null;
    }
    throw new Error(`Nicht unterstützte Abfrage: ${this.query}`);
  }

  async run(): Promise<Ergebnis<never>> {
    const ok = (changes: number): Ergebnis<never> => ({
      success: true,
      meta: { changes },
      results: [],
    });

    if (this.query.startsWith('INSERT INTO ehrungen_personen')) {
      const [id, nachname, vorname, schluessel, stunden, eintrittsdatum, am, von] = this.werte as [
        string,
        string,
        string,
        string,
        number,
        string | null,
        string,
        string,
      ];
      if ([...this.db.zeilen.values()].some((z) => z.schluessel === schluessel)) {
        throw new Error('UNIQUE constraint failed: ehrungen_personen.schluessel');
      }
      this.db.zeilen.set(id, {
        id,
        nachname,
        vorname,
        schluessel,
        stunden,
        eintrittsdatum,
        besondere_verdienste: 0,
        erhalten: '{}',
        geaendert_am: am,
        geaendert_von: von,
        version: 1,
      });
      return ok(1);
    }

    if (this.query.startsWith('UPDATE ehrungen_personen SET stunden = ?')) {
      const [stunden, eintrittsdatum, am, von, id, version] = this.werte as [
        number,
        string | null,
        string,
        string,
        string,
        number,
      ];
      const zeile = this.db.zeilen.get(id);
      if (!zeile || zeile.version !== version) return ok(0);
      this.db.zeilen.set(id, {
        ...zeile,
        stunden,
        eintrittsdatum,
        geaendert_am: am,
        geaendert_von: von,
        version: version + 1,
      });
      return ok(1);
    }

    if (this.query.startsWith('UPDATE ehrungen_personen SET eintrittsdatum = ?')) {
      const [eintrittsdatum, verdienste, erhalten, am, von, id, version] = this.werte as [
        string | null,
        number,
        string,
        string,
        string,
        string,
        number,
      ];
      const zeile = this.db.zeilen.get(id);
      if (!zeile || zeile.version !== version) return ok(0);
      this.db.zeilen.set(id, {
        ...zeile,
        eintrittsdatum,
        besondere_verdienste: verdienste,
        erhalten,
        geaendert_am: am,
        geaendert_von: von,
        version: version + 1,
      });
      return ok(1);
    }

    if (this.query.startsWith('DELETE FROM ehrungen_personen WHERE id = ?')) {
      return ok(this.db.zeilen.delete(this.werte[0] as string) ? 1 : 0);
    }

    throw new Error(`Nicht unterstützte Anweisung: ${this.query}`);
  }
}
