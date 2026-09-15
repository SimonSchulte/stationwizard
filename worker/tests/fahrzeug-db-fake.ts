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
  gruppe: string;
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

interface AenderungZeile {
  id: string;
  fahrzeug_id: string;
  zeitpunkt: string;
  von: string;
  beschreibung: string;
}

/**
 * Vergleichsform des Kennzeichens, wie sie der eindeutige Index aus
 * `migrations/0003_kennzeichen_eindeutig.sql` bildet: Großschreibung ohne
 * Leerzeichen, Bindestriche und Punkte. Ohne diese Nachbildung würde der Fake
 * doppelte Kennzeichen annehmen, die die echte Datenbank ablehnt.
 */
export function vergleichsform(kennzeichen: string): string {
  return kennzeichen.replace(/[ \-.]/g, '').toUpperCase();
}

export class FakeFahrzeugeDb {
  fahrzeuge = new Map<string, FahrzeugZeile>();
  ablesungen: AblesungZeile[] = [];
  aenderungen: AenderungZeile[] = [];

  /**
   * Der eindeutige Index selbst; er lässt leere Kennzeichen mehrfach zu, weil
   * er partiell ist. Greift beim Schreiben und ist nicht umgehbar.
   */
  indexTreffer(kennzeichen: string, ausserId: string): string | null {
    const gesucht = vergleichsform(kennzeichen);
    if (gesucht === '') return null;
    for (const zeile of this.fahrzeuge.values()) {
      if (zeile.id !== ausserId && vergleichsform(zeile.kennzeichen) === gesucht) return zeile.id;
    }
    return null;
  }

  /**
   * Antwort auf die Vorabprüfung des Workers. Getrennt vom Index, damit ein
   * Test das Rennen zwischen „Prüfung meldet frei" und „Index schlägt zu"
   * nachstellen kann, indem er nur diese Methode überschreibt.
   */
  vorabTreffer(kennzeichen: string, ausserId: string): string | null {
    return this.indexTreffer(kennzeichen, ausserId);
  }

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
        gruppe,
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
        string,
      ];
      if (this.db.fahrzeuge.has(id)) {
        throw new Error('UNIQUE constraint failed: fahrzeuge.id');
      }
      if (this.db.indexTreffer(kennzeichen, id) !== null) {
        throw new Error('UNIQUE constraint failed: index idx_fahrzeuge_kennzeichen_eindeutig');
      }
      this.db.fahrzeuge.set(id, {
        id,
        bezeichnung,
        funkrufname,
        kennzeichen,
        fahrgestellnummer,
        eigentuemer,
        gruppe,
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
        gruppe,
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
        string,
        number,
      ];
      const bestehend = this.db.fahrzeuge.get(id);
      if (!bestehend || bestehend.version !== erwarteteVersion) {
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      if (this.db.indexTreffer(kennzeichen, id) !== null) {
        throw new Error('UNIQUE constraint failed: index idx_fahrzeuge_kennzeichen_eindeutig');
      }
      this.db.fahrzeuge.set(id, {
        ...bestehend,
        bezeichnung,
        funkrufname,
        kennzeichen,
        fahrgestellnummer,
        eigentuemer,
        gruppe,
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

    if (this.query.startsWith('INSERT INTO fahrzeug_aenderungen')) {
      const [id, fahrzeug_id, zeitpunkt, von, beschreibung] = this.werte as [
        string,
        string,
        string,
        string,
        string,
      ];
      this.db.aenderungen.push({ id, fahrzeug_id, zeitpunkt, von, beschreibung });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('DELETE FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')) {
      const [id, fahrzeugId] = this.werte as [string, string];
      const vorher = this.db.ablesungen.length;
      this.db.ablesungen = this.db.ablesungen.filter(
        (a) => !(a.id === id && a.fahrzeug_id === fahrzeugId),
      );
      return {
        success: true,
        meta: { changes: vorher - this.db.ablesungen.length },
        results: [],
      };
    }

    throw new Error(`FakeFahrzeugeDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.query.startsWith('SELECT * FROM fahrzeuge WHERE id = ?')) {
      const [id] = this.werte as [string];
      return (this.db.fahrzeuge.get(id) as T | undefined) ?? null;
    }
    if (this.query.startsWith('SELECT id FROM fahrzeuge WHERE upper(replace(')) {
      const [kennzeichen, eigeneId] = this.werte as [string, string];
      const belegtVon = this.db.vorabTreffer(kennzeichen, eigeneId);
      return belegtVon === null ? null : ({ id: belegtVon } as T);
    }
    if (this.query.startsWith('SELECT id FROM fahrzeuge WHERE id = ?')) {
      const [id] = this.werte as [string];
      return this.db.fahrzeuge.has(id) ? ({ id } as T) : null;
    }
    if (this.query.startsWith('SELECT * FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')) {
      const [id, fahrzeugId] = this.werte as [string, string];
      const treffer = this.db.ablesungen.find((a) => a.id === id && a.fahrzeug_id === fahrzeugId);
      return (treffer as T | undefined) ?? null;
    }
    if (this.query.startsWith('SELECT id FROM ablesungen WHERE id = ? AND fahrzeug_id = ?')) {
      const [id, fahrzeugId] = this.werte as [string, string];
      const treffer = this.db.ablesungen.find((a) => a.id === id && a.fahrzeug_id === fahrzeugId);
      return treffer ? ({ id: treffer.id } as T) : null;
    }
    if (this.query.startsWith('SELECT id FROM ablesungen WHERE korrigiert = ?')) {
      const [korrigiert] = this.werte as [string];
      const treffer = this.db.ablesungen.find((a) => a.korrigiert === korrigiert);
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
    if (
      this.query.startsWith(
        'SELECT id, bezeichnung, funkrufname, kennzeichen, eigentuemer FROM fahrzeuge ORDER BY bezeichnung',
      )
    ) {
      const zeilen = [...this.db.fahrzeuge.values()]
        .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung))
        .map(({ id, bezeichnung, funkrufname, kennzeichen, eigentuemer }) => ({
          id,
          bezeichnung,
          funkrufname,
          kennzeichen,
          eigentuemer,
        }));
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (
      this.query.startsWith(
        'SELECT id, fahrzeug_id, abgelesen_am, stand, korrigiert FROM ablesungen',
      )
    ) {
      const zeilen = this.db.ablesungen.map(
        ({ id, fahrzeug_id, abgelesen_am, stand, korrigiert }) => ({
          id,
          fahrzeug_id,
          abgelesen_am,
          stand,
          korrigiert,
        }),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT * FROM fahrzeug_aenderungen WHERE fahrzeug_id = ?')) {
      const [fahrzeugId] = this.werte as [string];
      const zeilen = this.db.aenderungen
        .filter((a) => a.fahrzeug_id === fahrzeugId)
        .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeFahrzeugeDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
