/**
 * Echte SQLite-Datenbank (`node:sqlite`) hinter der Teilmenge der D1-Schnittstelle, die der Worker
 * benutzt. Anders als die handgeschriebenen `*-db-fake.ts` läuft hier das echte SQL der Module gegen
 * das echte Schema der Migrationen: Fremdschlüssel, Eindeutigkeit und `CHECK`-Bedingungen greifen.
 * Neue Module sollten diesen Weg nehmen statt eines weiteren festverdrahteten Fakes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const MIGRATIONEN = join(__dirname, '..', 'migrations');

export class SqliteD1 {
  readonly db = new DatabaseSync(':memory:');

  /** `ordner` sind Unterordner von `worker/migrations/`, zum Beispiel `['fahrzeuge']`. */
  constructor(ordner: readonly string[] = []) {
    this.db.exec('PRAGMA foreign_keys = ON');
    for (const name of ordner) {
      const verzeichnis = join(MIGRATIONEN, name);
      for (const datei of readdirSync(verzeichnis)
        .filter((d) => d.endsWith('.sql'))
        .sort()) {
        this.db.exec(readFileSync(join(verzeichnis, datei), 'utf8'));
      }
    }
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this, sql);
  }

  async batch(anweisungen: SqliteStatement[]) {
    const ergebnisse = [];
    this.db.exec('BEGIN');
    try {
      for (const anweisung of anweisungen) ergebnisse.push(await anweisung.run());
      this.db.exec('COMMIT');
    } catch (fehler) {
      this.db.exec('ROLLBACK');
      throw fehler;
    }
    return ergebnisse;
  }
}

export class SqliteStatement {
  private werte: SQLInputValue[] = [];

  constructor(
    private readonly datenbank: SqliteD1,
    private readonly sql: string,
  ) {}

  bind(...werte: unknown[]): SqliteStatement {
    this.werte = werte.map((w) =>
      w === undefined
        ? null
        : typeof w === 'boolean'
          ? Number(w)
          : w instanceof ArrayBuffer
            ? new Uint8Array(w)
            : (w as SQLInputValue),
    );
    return this;
  }

  async first<T = Record<string, unknown>>(spalte?: string): Promise<T | null> {
    const zeile = this.datenbank.db.prepare(this.sql).get(...this.werte) as
      Record<string, unknown> | undefined;
    if (!zeile) return null;
    return (spalte ? zeile[spalte] : { ...zeile }) as T;
  }

  async all<T = Record<string, unknown>>() {
    const results = this.datenbank.db
      .prepare(this.sql)
      .all(...this.werte)
      .map((z) => ({ ...z })) as T[];
    return { success: true, results, meta: { changes: 0 } };
  }

  async run() {
    const ergebnis = this.datenbank.db.prepare(this.sql).run(...this.werte);
    return { success: true, results: [], meta: { changes: Number(ergebnis.changes) } };
  }
}
