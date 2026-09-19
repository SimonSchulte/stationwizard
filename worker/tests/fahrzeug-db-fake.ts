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
  erfassung_token: string | null;
  erfassung_token_am: string | null;
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
  gemeldet_von_name: string | null;
}

interface EinreichungZeile {
  id: string;
  fahrzeug_id: string;
  abgelesen_am: string;
  stand: number;
  eingereicht_am: string;
  eingereicht_von_name: string;
  bemerkung: string;
  status: string;
  entschieden_am: string | null;
  entschieden_von: string | null;
  ablehnungsgrund: string | null;
  ablesung_id: string | null;
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
  einreichungen: EinreichungZeile[] = [];

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

  /**
   * `einreichungen.ts` setzt die erzeugte Ablesung und den Protokolleintrag
   * gemeinsam ab. Der Fake führt sie der Reihe nach aus; er bildet damit die
   * Reihenfolge nach, nicht die Atomarität einer echten D1-Transaktion.
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
        erfassung_token,
        erfassung_token_am,
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
        erfassung_token,
        erfassung_token_am,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    // Vor dem allgemeinen Stammdaten-UPDATE geprüft: beide beginnen mit
    // "UPDATE fahrzeuge", und die Reihenfolge entscheidet, welcher Zweig greift.
    if (this.query.startsWith('UPDATE fahrzeuge SET erfassung_token = ?')) {
      const [token, tokenAm, id] = this.werte as [string, string, string];
      const bestehend = this.db.fahrzeuge.get(id);
      if (!bestehend) return { success: true, meta: { changes: 0 }, results: [] };
      this.db.fahrzeuge.set(id, {
        ...bestehend,
        erfassung_token: token,
        erfassung_token_am: tokenAm,
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
        gemeldet_von_name,
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
        string | undefined,
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
        gemeldet_von_name: gemeldet_von_name ?? null,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (
      this.query.startsWith(
        "UPDATE ablesung_einreichungen SET status = 'freigegeben', entschieden_am = ?",
      )
    ) {
      const [entschiedenAm, entschiedenVon, ablesungId, id] = this.werte as [
        string,
        string,
        string,
        string,
      ];
      // Der Waechter: nur eine noch offene Meldung aendert sich. Ohne diese
      // Nachbildung taeuschte der Test ueber den Rennfall zweier Freigebender
      // hinweg.
      const treffer = this.db.einreichungen.find((e) => e.id === id && e.status === 'offen');
      if (!treffer) return { success: true, meta: { changes: 0 }, results: [] };
      treffer.status = 'freigegeben';
      treffer.entschieden_am = entschiedenAm;
      treffer.entschieden_von = entschiedenVon;
      treffer.ablesung_id = ablesungId;
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (
      this.query.startsWith(
        "UPDATE ablesung_einreichungen SET status = 'abgelehnt', entschieden_am = ?",
      )
    ) {
      const [entschiedenAm, entschiedenVon, grund, id] = this.werte as [
        string,
        string,
        string,
        string,
      ];
      const treffer = this.db.einreichungen.find((e) => e.id === id && e.status === 'offen');
      if (!treffer) return { success: true, meta: { changes: 0 }, results: [] };
      treffer.status = 'abgelehnt';
      treffer.entschieden_am = entschiedenAm;
      treffer.entschieden_von = entschiedenVon;
      treffer.ablehnungsgrund = grund;
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('INSERT INTO ablesung_einreichungen')) {
      const [
        id,
        fahrzeug_id,
        abgelesen_am,
        stand,
        eingereicht_am,
        eingereicht_von_name,
        bemerkung,
      ] = this.werte as [string, string, string, number, string, string, string];
      this.db.einreichungen.push({
        id,
        fahrzeug_id,
        abgelesen_am,
        stand,
        eingereicht_am,
        eingereicht_von_name,
        bemerkung,
        status: 'offen',
        entschieden_am: null,
        entschieden_von: null,
        ablehnungsgrund: null,
        ablesung_id: null,
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
    if (
      this.query.startsWith(
        'SELECT e.id, e.fahrzeug_id, e.abgelesen_am, e.stand, e.eingereicht_von_name, e.bemerkung, e.status, f.gruppe',
      )
    ) {
      const [id] = this.werte as [string];
      const treffer = this.db.einreichungen.find((e) => e.id === id);
      if (!treffer) return null;
      const fahrzeug = this.db.fahrzeuge.get(treffer.fahrzeug_id);
      if (!fahrzeug) return null;
      return {
        id: treffer.id,
        fahrzeug_id: treffer.fahrzeug_id,
        abgelesen_am: treffer.abgelesen_am,
        stand: treffer.stand,
        eingereicht_von_name: treffer.eingereicht_von_name,
        bemerkung: treffer.bemerkung,
        status: treffer.status,
        gruppe: fahrzeug.gruppe,
      } as T;
    }
    if (
      this.query.startsWith(
        'SELECT id, bezeichnung, funkrufname, kennzeichen, erfassung_token FROM fahrzeuge WHERE erfassung_token = ?',
      )
    ) {
      const [token] = this.werte as [string];
      for (const zeile of this.db.fahrzeuge.values()) {
        if (zeile.erfassung_token === token) {
          const { id, bezeichnung, funkrufname, kennzeichen, erfassung_token } = zeile;
          return { id, bezeichnung, funkrufname, kennzeichen, erfassung_token } as T;
        }
      }
      return null;
    }
    if (
      this.query.startsWith(
        "SELECT COUNT(*) AS anzahl FROM ablesung_einreichungen WHERE fahrzeug_id = ? AND status = 'offen'",
      )
    ) {
      const [fahrzeugId] = this.werte as [string];
      const anzahl = this.db.einreichungen.filter(
        (e) => e.fahrzeug_id === fahrzeugId && e.status === 'offen',
      ).length;
      return { anzahl } as T;
    }
    if (
      this.query.startsWith(
        'SELECT MAX(eingereicht_am) AS zuletzt FROM ablesung_einreichungen WHERE fahrzeug_id = ?',
      )
    ) {
      const [fahrzeugId] = this.werte as [string];
      const zeitpunkte = this.db.einreichungen
        .filter((e) => e.fahrzeug_id === fahrzeugId)
        .map((e) => e.eingereicht_am)
        .sort();
      return { zuletzt: zeitpunkte.at(-1) ?? null } as T;
    }
    if (this.query.startsWith('SELECT erfassung_token FROM fahrzeuge WHERE id = ?')) {
      const [id] = this.werte as [string];
      const zeile = this.db.fahrzeuge.get(id);
      return zeile ? ({ erfassung_token: zeile.erfassung_token } as T) : null;
    }
    if (this.query.startsWith('SELECT gruppe FROM fahrzeuge WHERE id = ?')) {
      const [id] = this.werte as [string];
      const zeile = this.db.fahrzeuge.get(id);
      return zeile ? ({ gruppe: zeile.gruppe } as T) : null;
    }
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
    if (
      this.query.startsWith(
        'SELECT e.id, e.fahrzeug_id, e.abgelesen_am, e.stand, e.eingereicht_am, e.eingereicht_von_name, e.bemerkung,',
      )
    ) {
      const gruppen = new Set(this.werte as string[]);
      // Korrigierte Ablesungen zaehlen nicht als letzter Stand – dieselbe Regel
      // wie in fahrzeug-detail.ts und km-bericht.ts.
      const korrigierte = new Set(
        this.db.ablesungen.map((a) => a.korrigiert).filter((id): id is string => id !== null),
      );
      const letzte = (fahrzeugId: string) =>
        this.db.ablesungen
          .filter((a) => a.fahrzeug_id === fahrzeugId && !korrigierte.has(a.id))
          .sort(
            (a, b) =>
              a.abgelesen_am.localeCompare(b.abgelesen_am) ||
              a.erfasst_am.localeCompare(b.erfasst_am),
          )
          .at(-1) ?? null;

      const zeilen = this.db.einreichungen
        .filter((e) => e.status === 'offen')
        .map((e) => ({ e, f: this.db.fahrzeuge.get(e.fahrzeug_id) }))
        .filter((paar) => paar.f !== undefined && gruppen.has(paar.f.gruppe))
        .sort((a, b) => a.e.eingereicht_am.localeCompare(b.e.eingereicht_am))
        .map(({ e, f }) => {
          const vorher = letzte(e.fahrzeug_id);
          return {
            id: e.id,
            fahrzeug_id: e.fahrzeug_id,
            abgelesen_am: e.abgelesen_am,
            stand: e.stand,
            eingereicht_am: e.eingereicht_am,
            eingereicht_von_name: e.eingereicht_von_name,
            bemerkung: e.bemerkung,
            bezeichnung: f!.bezeichnung,
            kennzeichen: f!.kennzeichen,
            gruppe: f!.gruppe,
            letzter_stand: vorher?.stand ?? null,
            letzter_stand_am: vorher?.abgelesen_am ?? null,
          };
        });
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (
      this.query.startsWith(
        'SELECT id, bezeichnung, funkrufname, kennzeichen, gruppe, erfassung_token FROM fahrzeuge WHERE gruppe IN (',
      )
    ) {
      const gruppen = new Set(this.werte as string[]);
      const zeilen = [...this.db.fahrzeuge.values()]
        .filter((f) => gruppen.has(f.gruppe))
        .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung))
        .map(({ id, bezeichnung, funkrufname, kennzeichen, gruppe, erfassung_token }) => ({
          id,
          bezeichnung,
          funkrufname,
          kennzeichen,
          gruppe,
          erfassung_token,
        }));
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
