/**
 * Minimaler D1-Ersatz für die Materialtests: nur die Teilmenge von
 * `D1Database`, die `worker/src/material.ts` tatsächlich verwendet
 * (`prepare().bind().run()/.first()/.all()`), gegen In-Memory-Tabellen. Kein
 * echter SQL-Parser – jede unterstützte Anweisung ist fest verdrahtet, damit
 * ein Test niemals über eine falsch nachgebildete Query hinwegtäuscht.
 */

export interface VorlageZeile {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  grundlage: string;
  inhalt: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

export interface BehaelterZeile {
  id: string;
  fahrzeug_id: string;
  vorlage_id: string;
  bezeichnung: string;
  bemerkung: string;
  check_token: string | null;
  check_token_am: string | null;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
}

export interface CheckZeile {
  id: string;
  behaelter_id: string;
  vorlage_id?: string;
  vorlage_version?: number;
  vorlage_bezeichnung?: string;
  grundlage?: string;
  geprueft_am: string;
  erfasst_am: string;
  erfasst_von?: string;
  gemeldet_von_name?: string | null;
  quelle?: string;
  verfallsdatum_erfasst?: number;
  bemerkung?: string;
  positionen?: string;
  positionen_gesamt?: number;
  positionen_geprueft?: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
}

export interface FahrzeugStammZeile {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  gruppe: string;
}

export class FakeMaterialDb {
  vorlagen = new Map<string, VorlageZeile>();
  behaelter = new Map<string, BehaelterZeile>();
  checks: CheckZeile[] = [];
  fahrzeuge = new Map<string, FahrzeugStammZeile>();

  /** Zähler statt Zufall, damit ein Test das erzeugte Prüftoken kennt. */
  tokenZaehler = 0;

  naechstesToken(): string {
    this.tokenZaehler += 1;
    return this.tokenZaehler.toString(16).padStart(32, '0');
  }

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query.trim().replace(/\s+/g, ' '));
  }

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
    private readonly db: FakeMaterialDb,
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
    if (this.query.startsWith('INSERT INTO pruefvorlagen')) {
      const [id, bezeichnung, beschreibung, grundlage, inhalt, geaendert_am, geaendert_von] = this
        .werte as [string, string, string, string, string, string, string];
      if (this.db.vorlagen.has(id)) throw new Error('UNIQUE constraint failed: pruefvorlagen.id');
      this.db.vorlagen.set(id, {
        id,
        bezeichnung,
        beschreibung,
        grundlage,
        inhalt,
        geaendert_am,
        geaendert_von,
        version: 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('UPDATE pruefvorlagen SET')) {
      const [
        bezeichnung,
        beschreibung,
        grundlage,
        inhalt,
        geaendert_am,
        geaendert_von,
        id,
        version,
      ] = this.werte as [string, string, string, string, string, string, string, number];
      const zeile = this.db.vorlagen.get(id);
      if (!zeile || zeile.version !== version) {
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      Object.assign(zeile, {
        bezeichnung,
        beschreibung,
        grundlage,
        inhalt,
        geaendert_am,
        geaendert_von,
        version: zeile.version + 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('DELETE FROM pruefvorlagen WHERE id = ?')) {
      const [id] = this.werte as [string];
      return { success: true, meta: { changes: this.db.vorlagen.delete(id) ? 1 : 0 }, results: [] };
    }

    if (this.query.startsWith('INSERT INTO behaelter')) {
      const [
        id,
        fahrzeug_id,
        vorlage_id,
        bezeichnung,
        bemerkung,
        check_token_am,
        geaendert_am,
        geaendert_von,
      ] = this.werte as [string, string, string, string, string, string, string, string];
      if (this.db.behaelter.has(id)) throw new Error('UNIQUE constraint failed: behaelter.id');
      this.db.behaelter.set(id, {
        id,
        fahrzeug_id,
        vorlage_id,
        bezeichnung,
        bemerkung,
        // Der Worker überlässt das Token der Datenbank (`randomblob`); der Fake
        // bildet genau das nach, statt es aus den Bindewerten zu nehmen.
        check_token: this.db.naechstesToken(),
        check_token_am,
        geaendert_am,
        geaendert_von,
        version: 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('UPDATE behaelter SET')) {
      const [
        fahrzeug_id,
        vorlage_id,
        bezeichnung,
        bemerkung,
        geaendert_am,
        geaendert_von,
        id,
        version,
      ] = this.werte as [string, string, string, string, string, string, string, number];
      const zeile = this.db.behaelter.get(id);
      if (!zeile || zeile.version !== version) {
        return { success: true, meta: { changes: 0 }, results: [] };
      }
      Object.assign(zeile, {
        fahrzeug_id,
        vorlage_id,
        bezeichnung,
        bemerkung,
        geaendert_am,
        geaendert_von,
        version: zeile.version + 1,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('DELETE FROM behaelter WHERE id = ?')) {
      const [id] = this.werte as [string];
      return {
        success: true,
        meta: { changes: this.db.behaelter.delete(id) ? 1 : 0 },
        results: [],
      };
    }

    if (this.query.startsWith('INSERT INTO materialchecks')) {
      const [
        id,
        behaelter_id,
        vorlage_id,
        vorlage_version,
        vorlage_bezeichnung,
        grundlage,
        geprueft_am,
        erfasst_am,
        erfasst_von,
        verfallsdatum_erfasst,
        bemerkung,
        positionen,
        positionen_gesamt,
        positionen_geprueft,
        fehlmengen,
        unbrauchbar,
        abgelaufen,
      ] = this.werte as [
        string,
        string,
        string,
        number,
        string,
        string,
        string,
        string,
        string,
        number,
        string,
        string,
        number,
        number,
        number,
        number,
        number,
      ];
      this.db.checks.push({
        id,
        behaelter_id,
        vorlage_id,
        vorlage_version,
        vorlage_bezeichnung,
        grundlage,
        geprueft_am,
        erfasst_am,
        erfasst_von,
        // `gemeldet_von_name` und `quelle` stehen als Literale in der Anweisung,
        // nicht unter den Bindewerten: die Quelle 'oeffentlich' darf über diesen
        // Weg gar nicht erst einreichbar sein.
        gemeldet_von_name: null,
        quelle: 'angemeldet',
        verfallsdatum_erfasst,
        bemerkung,
        positionen,
        positionen_gesamt,
        positionen_geprueft,
        fehlmengen,
        unbrauchbar,
        abgelaufen,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    throw new Error(`FakeMaterialDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.query.startsWith('SELECT * FROM pruefvorlagen WHERE id = ?')) {
      const [id] = this.werte as [string];
      return (this.db.vorlagen.get(id) ?? null) as T | null;
    }
    if (this.query.startsWith('SELECT 1 AS treffer FROM pruefvorlagen WHERE id = ?')) {
      const [id] = this.werte as [string];
      return this.db.vorlagen.has(id) ? ({ treffer: 1 } as T) : null;
    }
    if (this.query.startsWith('SELECT * FROM behaelter WHERE id = ?')) {
      const [id] = this.werte as [string];
      return (this.db.behaelter.get(id) ?? null) as T | null;
    }
    if (this.query.startsWith('SELECT 1 AS treffer FROM behaelter WHERE vorlage_id = ?')) {
      const [vorlageId] = this.werte as [string];
      const treffer = [...this.db.behaelter.values()].some((b) => b.vorlage_id === vorlageId);
      return treffer ? ({ treffer: 1 } as T) : null;
    }
    if (this.query.startsWith('SELECT 1 AS treffer FROM fahrzeuge WHERE id = ?')) {
      const [id] = this.werte as [string];
      return this.db.fahrzeuge.has(id) ? ({ treffer: 1 } as T) : null;
    }
    if (this.query.startsWith('SELECT 1 AS treffer FROM materialchecks WHERE behaelter_id = ?')) {
      const [behaelterId] = this.werte as [string];
      const treffer = this.db.checks.some((c) => c.behaelter_id === behaelterId);
      return treffer ? ({ treffer: 1 } as T) : null;
    }
    if (this.query.includes('v.inhalt AS vorlage_inhalt')) {
      const [id] = this.werte as [string];
      const b = this.db.behaelter.get(id);
      if (!b) return null;
      const fahrzeug = this.db.fahrzeuge.get(b.fahrzeug_id);
      const vorlage = this.db.vorlagen.get(b.vorlage_id);
      // JOIN, kein LEFT JOIN: ohne Fahrzeug oder Vorlage keine Zeile.
      if (!fahrzeug || !vorlage) return null;
      return {
        ...b,
        fahrzeug_bezeichnung: fahrzeug.bezeichnung,
        fahrzeug_funkrufname: fahrzeug.funkrufname,
        fahrzeug_gruppe: fahrzeug.gruppe,
        vorlage_bezeichnung: vorlage.bezeichnung,
        vorlage_grundlage: vorlage.grundlage,
        vorlage_inhalt: vorlage.inhalt,
        vorlage_version: vorlage.version,
      } as T;
    }
    if (this.query.includes('b.bezeichnung AS behaelter_bezeichnung')) {
      const [id] = this.werte as [string];
      const check = this.db.checks.find((c) => c.id === id);
      if (!check) return null;
      const behaelter = this.db.behaelter.get(check.behaelter_id);
      const fahrzeug = behaelter ? this.db.fahrzeuge.get(behaelter.fahrzeug_id) : undefined;
      // JOIN, kein LEFT JOIN: ohne Behälter oder Fahrzeug keine Zeile.
      if (!behaelter || !fahrzeug) return null;
      return {
        ...check,
        behaelter_bezeichnung: behaelter.bezeichnung,
        fahrzeug_bezeichnung: fahrzeug.bezeichnung,
      } as T;
    }
    if (this.query.startsWith('SELECT * FROM materialchecks WHERE id = ?')) {
      const [id] = this.werte as [string];
      return (this.db.checks.find((c) => c.id === id) ?? null) as T | null;
    }
    throw new Error(`FakeMaterialDb: unbekannte first()-Anweisung: ${this.query}`);
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }> {
    if (this.query.startsWith('SELECT * FROM pruefvorlagen ORDER BY bezeichnung')) {
      const zeilen = [...this.db.vorlagen.values()].sort((a, b) =>
        a.bezeichnung.localeCompare(b.bezeichnung),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT b.*, f.bezeichnung AS fahrzeug_bezeichnung')) {
      const zeilen = [...this.db.behaelter.values()]
        .flatMap((b) => {
          const fahrzeug = this.db.fahrzeuge.get(b.fahrzeug_id);
          const vorlage = this.db.vorlagen.get(b.vorlage_id);
          // JOIN, kein LEFT JOIN: ohne Fahrzeug oder Vorlage keine Zeile.
          if (!fahrzeug || !vorlage) return [];
          const letzter = this.db.checks
            .filter((c) => c.behaelter_id === b.id)
            .sort((x, y) =>
              `${x.geprueft_am}T${x.erfasst_am}`.localeCompare(`${y.geprueft_am}T${y.erfasst_am}`),
            )
            .at(-1);
          return [
            {
              ...b,
              fahrzeug_bezeichnung: fahrzeug.bezeichnung,
              fahrzeug_funkrufname: fahrzeug.funkrufname,
              fahrzeug_gruppe: fahrzeug.gruppe,
              vorlage_bezeichnung: vorlage.bezeichnung,
              zuletzt_geprueft_am: letzter?.geprueft_am ?? null,
              letzter_check_id: letzter?.id ?? null,
              letzte_fehlmengen: letzter?.fehlmengen ?? null,
              letzte_unbrauchbar: letzter?.unbrauchbar ?? null,
              letzte_abgelaufen: letzter?.abgelaufen ?? null,
            },
          ];
        })
        .sort(
          (a, b) =>
            a.fahrzeug_bezeichnung.localeCompare(b.fahrzeug_bezeichnung) ||
            a.bezeichnung.localeCompare(b.bezeichnung),
        );
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT * FROM materialchecks WHERE behaelter_id = ?')) {
      const [behaelterId] = this.werte as [string];
      const zeilen = this.db.checks
        .filter((c) => c.behaelter_id === behaelterId)
        .sort((a, b) =>
          `${b.geprueft_am}T${b.erfasst_am}`.localeCompare(`${a.geprueft_am}T${a.erfasst_am}`),
        );
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeMaterialDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
