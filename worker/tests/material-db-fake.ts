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

export interface EinreichungZeile {
  id: string;
  behaelter_id: string;
  geprueft_am: string;
  positionen: string;
  positionen_gesamt: number;
  positionen_geprueft: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
  eingereicht_am: string;
  eingereicht_von_name: string;
  status: string;
  vorlage_id?: string;
  vorlage_version?: number;
  vorlage_bezeichnung?: string;
  grundlage?: string;
  verfallsdatum_erfasst?: number;
  bemerkung?: string;
  entschieden_am?: string | null;
  entschieden_von?: string | null;
  ablehnungsgrund?: string | null;
  check_id?: string | null;
}

export interface EntwurfZeile {
  behaelter_id: string;
  inhaber: string;
  inhalt: string;
  gespeichert_am: string;
  gespeichert_von_name: string;
}

export interface FahrzeugStammZeile {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  gruppe: string;
}

function entwurfSchluessel(behaelterId: string, inhaber: string): string {
  return `${behaelterId}\u0000${inhaber}`;
}

export class FakeMaterialDb {
  vorlagen = new Map<string, VorlageZeile>();
  behaelter = new Map<string, BehaelterZeile>();
  checks: CheckZeile[] = [];
  einreichungen: EinreichungZeile[] = [];
  /** Schlüssel: `<behaelter_id>\u0000<inhaber>`, wie der zusammengesetzte Primärschlüssel. */
  entwuerfe = new Map<string, EntwurfZeile>();
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
    if (this.query.startsWith('INSERT INTO check_entwuerfe')) {
      const [behaelterId, inhaber, inhalt, gespeichertAm] = this.werte as [
        string,
        string,
        string,
        string,
      ];
      // ON CONFLICT DO UPDATE: derselbe Schlüssel ersetzt, er verdoppelt nicht.
      this.db.entwuerfe.set(entwurfSchluessel(behaelterId, inhaber), {
        behaelter_id: behaelterId,
        inhaber,
        inhalt,
        gespeichert_am: gespeichertAm,
        gespeichert_von_name: '',
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('DELETE FROM check_entwuerfe')) {
      const [behaelterId, inhaber] = this.werte as [string, string];
      const entfernt = this.db.entwuerfe.delete(entwurfSchluessel(behaelterId, inhaber));
      return { success: true, meta: { changes: entfernt ? 1 : 0 }, results: [] };
    }

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

    // Die Freigabe einer Einreichung bindet `gemeldet_von_name` und trägt
    // 'oeffentlich' als Literal; der angemeldete Weg bindet stattdessen weniger
    // Werte und hat NULL und 'angemeldet' als Literale. Unterschieden wird
    // daran, sonst läge die Quelle jedes freigegebenen Checks falsch.
    if (
      this.query.startsWith('INSERT INTO materialchecks') &&
      this.query.includes("'oeffentlich'")
    ) {
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
        gemeldet_von_name,
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
        gemeldet_von_name,
        quelle: 'oeffentlich',
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

    if (this.query.startsWith('INSERT INTO check_einreichungen')) {
      const [
        id,
        behaelter_id,
        ,
        ,
        ,
        ,
        geprueft_am,
        ,
        ,
        positionen,
        positionen_gesamt,
        positionen_geprueft,
        fehlmengen,
        unbrauchbar,
        abgelaufen,
        eingereicht_am,
        eingereicht_von_name,
      ] = this.werte as [
        string,
        string,
        string,
        number,
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
        string,
        string,
      ];
      this.db.einreichungen.push({
        id,
        behaelter_id,
        geprueft_am,
        positionen,
        positionen_gesamt,
        positionen_geprueft,
        fehlmengen,
        unbrauchbar,
        abgelaufen,
        eingereicht_am,
        eingereicht_von_name,
        vorlage_id: this.werte[2] as string,
        vorlage_version: this.werte[3] as number,
        vorlage_bezeichnung: this.werte[4] as string,
        grundlage: this.werte[5] as string,
        verfallsdatum_erfasst: this.werte[7] as number,
        bemerkung: this.werte[8] as string,
        // `status` steht als Literal 'offen' in der Anweisung, nicht unter den
        // Bindewerten: eine Einreichung entsteht nie als bereits entschieden.
        status: 'offen',
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith('UPDATE behaelter SET check_token = ?')) {
      const [check_token, check_token_am, id] = this.werte as [string, string, string];
      const zeile = this.db.behaelter.get(id);
      if (!zeile) return { success: true, meta: { changes: 0 }, results: [] };
      Object.assign(zeile, { check_token, check_token_am });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith("UPDATE check_einreichungen SET status = 'freigegeben'")) {
      const [entschieden_am, entschieden_von, check_id, id] = this.werte as [
        string,
        string,
        string,
        string,
      ];
      const zeile = this.db.einreichungen.find((e) => e.id === id && e.status === 'offen');
      if (!zeile) return { success: true, meta: { changes: 0 }, results: [] };
      Object.assign(zeile, { status: 'freigegeben', entschieden_am, entschieden_von, check_id });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    if (this.query.startsWith("UPDATE check_einreichungen SET status = 'abgelehnt'")) {
      const [entschieden_am, entschieden_von, ablehnungsgrund, id] = this.werte as [
        string,
        string,
        string,
        string,
      ];
      const zeile = this.db.einreichungen.find((e) => e.id === id && e.status === 'offen');
      if (!zeile) return { success: true, meta: { changes: 0 }, results: [] };
      Object.assign(zeile, {
        status: 'abgelehnt',
        entschieden_am,
        entschieden_von,
        ablehnungsgrund,
      });
      return { success: true, meta: { changes: 1 }, results: [] };
    }

    throw new Error(`FakeMaterialDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (this.query.startsWith('SELECT inhalt, gespeichert_am FROM check_entwuerfe')) {
      const [behaelterId, inhaber] = this.werte as [string, string];
      return (this.db.entwuerfe.get(entwurfSchluessel(behaelterId, inhaber)) ?? null) as T | null;
    }

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
    // Beide Abfragen lesen die Vorlage mit; unterschieden werden sie an der
    // WHERE-Bedingung – die eine sucht über die Behälter-Id, die andere über
    // das Prüftoken.
    if (
      this.query.includes('v.inhalt AS vorlage_inhalt') &&
      this.query.includes('WHERE b.id = ?')
    ) {
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
    // Auch die Einreichungsabfrage benennt `b.bezeichnung AS
    // behaelter_bezeichnung`; unterschieden wird an der Quelltabelle.
    if (
      this.query.includes('b.bezeichnung AS behaelter_bezeichnung') &&
      this.query.includes('FROM materialchecks c')
    ) {
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
    if (
      this.query.includes('v.inhalt AS vorlage_inhalt') &&
      this.query.includes('b.check_token = ?')
    ) {
      const [token] = this.werte as [string];
      const b = [...this.db.behaelter.values()].find((zeile) => zeile.check_token === token);
      if (!b) return null;
      const fahrzeug = this.db.fahrzeuge.get(b.fahrzeug_id);
      const vorlage = this.db.vorlagen.get(b.vorlage_id);
      if (!fahrzeug || !vorlage) return null;
      return {
        id: b.id,
        bezeichnung: b.bezeichnung,
        check_token: b.check_token,
        fahrzeug_bezeichnung: fahrzeug.bezeichnung,
        fahrzeug_funkrufname: fahrzeug.funkrufname,
        vorlage_id: vorlage.id,
        vorlage_version: vorlage.version,
        vorlage_bezeichnung: vorlage.bezeichnung,
        vorlage_grundlage: vorlage.grundlage,
        vorlage_inhalt: vorlage.inhalt,
      } as T;
    }
    if (this.query.includes('count(*) AS anzahl FROM check_einreichungen')) {
      const [behaelterId] = this.werte as [string];
      const anzahl = this.db.einreichungen.filter(
        (e) => e.behaelter_id === behaelterId && e.status === 'offen',
      ).length;
      return { anzahl } as T;
    }
    if (this.query.includes('SELECT eingereicht_am FROM check_einreichungen')) {
      const [behaelterId] = this.werte as [string];
      const letzte = this.db.einreichungen
        .filter((e) => e.behaelter_id === behaelterId)
        .sort((a, b) => a.eingereicht_am.localeCompare(b.eingereicht_am))
        .at(-1);
      return letzte ? ({ eingereicht_am: letzte.eingereicht_am } as T) : null;
    }
    if (this.query.includes('b.check_token, b.check_token_am, f.gruppe')) {
      const [id] = this.werte as [string];
      const b = this.db.behaelter.get(id);
      if (!b) return null;
      const fahrzeug = this.db.fahrzeuge.get(b.fahrzeug_id);
      if (!fahrzeug) return null;
      return {
        check_token: b.check_token,
        check_token_am: b.check_token_am,
        gruppe: fahrzeug.gruppe,
      } as T;
    }
    if (
      this.query.includes('FROM check_einreichungen e') &&
      this.query.includes('WHERE e.id = ?')
    ) {
      const [id] = this.werte as [string];
      const e = this.db.einreichungen.find((zeile) => zeile.id === id);
      if (!e) return null;
      const behaelter = this.db.behaelter.get(e.behaelter_id);
      const fahrzeug = behaelter ? this.db.fahrzeuge.get(behaelter.fahrzeug_id) : undefined;
      if (!behaelter || !fahrzeug) return null;
      return {
        ...e,
        behaelter_bezeichnung: behaelter.bezeichnung,
        fahrzeug_bezeichnung: fahrzeug.bezeichnung,
        fahrzeug_gruppe: fahrzeug.gruppe,
      } as T;
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
    if (this.query.includes('FROM check_einreichungen e')) {
      const gruppen = this.werte as string[];
      const zeilen = this.db.einreichungen
        .filter((e) => e.status === 'offen')
        .flatMap((e) => {
          const behaelter = this.db.behaelter.get(e.behaelter_id);
          const fahrzeug = behaelter ? this.db.fahrzeuge.get(behaelter.fahrzeug_id) : undefined;
          if (!behaelter || !fahrzeug || !gruppen.includes(fahrzeug.gruppe)) return [];
          return [
            {
              ...e,
              behaelter_bezeichnung: behaelter.bezeichnung,
              fahrzeug_bezeichnung: fahrzeug.bezeichnung,
              fahrzeug_gruppe: fahrzeug.gruppe,
            },
          ];
        })
        .sort((a, b) => a.eingereicht_am.localeCompare(b.eingereicht_am));
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeMaterialDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
