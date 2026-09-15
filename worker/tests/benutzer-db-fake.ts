/**
 * Minimaler D1-Ersatz für Tests: nur die Teilmenge von `D1Database`, die
 * `worker/src/benutzer.ts` tatsächlich verwendet, gegen eine In-Memory-
 * Tabelle. Kein echter SQL-Parser – jede unterstützte Anweisung ist fest
 * verdrahtet, analog zu `fahrzeug-db-fake.ts`.
 */

interface BenutzerZeile {
  email: string;
  rolle: string | null;
  sonderrollen: string;
  erster_zugriff_am: string;
  letzter_zugriff_am: string;
  rolle_geaendert_am: string | null;
  rolle_geaendert_von: string | null;
}

interface KonfigurationsZeile {
  schluessel: string;
  wert: string;
  geaendert_am: string;
  geaendert_von: string;
}

export class FakeBenutzerDb {
  benutzer = new Map<string, BenutzerZeile>();
  systemkonfiguration = new Map<string, KonfigurationsZeile>();

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query.trim().replace(/\s+/g, ' '));
  }

  /**
   * `worker/src/systemkonfiguration.ts` schreibt alle Einstellungen gemeinsam.
   * Der Fake führt sie der Reihe nach aus; er bildet damit die Reihenfolge
   * nach, nicht die Atomarität einer echten D1-Transaktion.
   */
  async batch<T = Record<string, unknown>>(
    anweisungen: FakeStatement[],
  ): Promise<{ success: true; meta: { changes: number }; results: T[] }[]> {
    const ergebnisse = [];
    for (const anweisung of anweisungen) {
      ergebnisse.push(await anweisung.run<T>());
    }
    return ergebnisse;
  }
}

class FakeStatement {
  private werte: unknown[] = [];

  constructor(
    private readonly db: FakeBenutzerDb,
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
    if (this.query.startsWith('INSERT INTO benutzer')) {
      // `sonderrollen` steht als Literal `'[]'` in der Anweisung, nicht als
      // Platzhalter – dieselben drei Bindwerte wie `registriereZugriff()`.
      const [email, erster_zugriff_am, letzter_zugriff_am] = this.werte as [string, string, string];
      const bestehend = this.db.benutzer.get(email);
      if (bestehend) {
        this.db.benutzer.set(email, { ...bestehend, letzter_zugriff_am });
      } else {
        this.db.benutzer.set(email, {
          email,
          rolle: null,
          sonderrollen: '[]',
          erster_zugriff_am,
          letzter_zugriff_am,
          rolle_geaendert_am: null,
          rolle_geaendert_von: null,
        });
      }
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('UPDATE benutzer')) {
      const [rolle, sonderrollen, rolle_geaendert_am, rolle_geaendert_von, email] = this.werte as [
        string | null,
        string,
        string,
        string,
        string,
      ];
      const bestehend = this.db.benutzer.get(email);
      if (!bestehend) return { success: true, meta: { changes: 0 }, results: [] };
      this.db.benutzer.set(email, {
        ...bestehend,
        rolle,
        sonderrollen,
        rolle_geaendert_am,
        rolle_geaendert_von,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('INSERT INTO systemkonfiguration')) {
      const [schluessel, wert, geaendert_am, geaendert_von] = this.werte as [
        string,
        string,
        string,
        string,
      ];
      this.db.systemkonfiguration.set(schluessel, {
        schluessel,
        wert,
        geaendert_am,
        geaendert_von,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    throw new Error(`FakeBenutzerDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.query.startsWith('SELECT email FROM benutzer WHERE email = ?')) {
      const [email] = this.werte as [string];
      return this.db.benutzer.has(email) ? ({ email } as T) : null;
    }
    if (this.query.startsWith('SELECT * FROM benutzer WHERE email = ?')) {
      const [email] = this.werte as [string];
      return (this.db.benutzer.get(email) as T | undefined) ?? null;
    }
    throw new Error(`FakeBenutzerDb: unbekannte first()-Anweisung: ${this.query}`);
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }> {
    if (this.query.startsWith('SELECT * FROM benutzer ORDER BY email')) {
      const zeilen = [...this.db.benutzer.values()].sort((a, b) => a.email.localeCompare(b.email));
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT schluessel, wert FROM systemkonfiguration')) {
      const zeilen = [...this.db.systemkonfiguration.values()].map(({ schluessel, wert }) => ({
        schluessel,
        wert,
      }));
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeBenutzerDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
