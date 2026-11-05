/**
 * Minimaler D1-Ersatz für `worker/src/einsatzplanung*.ts`: genau die Anweisungen, die
 * die Module verwenden, fest verdrahtet gegen In-Memory-Tabellen – analog zu
 * `angebotswesen-db-fake.ts`. Der partielle eindeutige Index auf der
 * HiOrg-Veranstaltung wird nachgebildet (wie `FakeFahrzeugeDb` das Kennzeichen).
 */

interface EinsatzZeile {
  id: string;
  titel: string;
  beginn: string | null;
  ende: string | null;
  ort: string | null;
  hiorg_veranstaltung_id: string | null;
  version: number;
  angelegt_am: string;
  geaendert_am: string;
  angelegt_von: string;
  geaendert_von: string;
}

interface VorlageZeile {
  id: string;
  titel: string;
  inhalt: string;
  abschnitte: number;
  laufzettel: number;
  positionen: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

interface VorbereitungZeile {
  einsatz_id: string;
  vorlage_id: string | null;
  vorlage_version: number | null;
  inhalt: string;
  laufzettel: number;
  positionen: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

interface PepZeile {
  einsatz_id: string;
  schema: number;
  vorlage_id: string | null;
  inhalt: string;
  posten: number;
  positionen: number;
  besetzt: number;
  einsatzkraefte: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

interface PepVorlageZeile {
  id: string;
  titel: string;
  inhalt: string;
  posten: number;
  positionen: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

export class FakeEinsatzplanungDb {
  einsaetze = new Map<string, EinsatzZeile>();
  vorlagen = new Map<string, VorlageZeile>();
  vorbereitungen = new Map<string, VorbereitungZeile>();
  peps = new Map<string, PepZeile>();
  pepVorlagen = new Map<string, PepVorlageZeile>();
  /** Zählt Lesezugriffe der Einsatzliste: sie muss mit genau einer Abfrage auskommen. */
  listenabfragen = 0;
  /** Simuliert ein Rennen: die Vorabprüfung der Veranstaltung findet nichts. */
  vorabpruefungUebergehen = false;

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query.trim().replace(/\s+/g, ' '));
  }

  veranstaltungBelegt(veranstaltung: string | null, ausser: string): boolean {
    if (veranstaltung === null) return false;
    return [...this.einsaetze.values()].some(
      (zeile) => zeile.hiorg_veranstaltung_id === veranstaltung && zeile.id !== ausser,
    );
  }
}

interface Ergebnis {
  success: true;
  meta: { changes: number };
  results: never[];
}

const OK: Ergebnis = { success: true, meta: { changes: 1 }, results: [] };
const KEIN_TREFFER: Ergebnis = { success: true, meta: { changes: 0 }, results: [] };

class FakeStatement {
  private werte: unknown[] = [];

  constructor(
    private readonly db: FakeEinsatzplanungDb,
    private readonly query: string,
  ) {}

  bind(...werte: unknown[]): FakeStatement {
    this.werte = werte;
    return this;
  }

  async run(): Promise<Ergebnis> {
    const w = this.werte;
    if (this.query.startsWith('INSERT INTO einsaetze')) {
      const [id, titel, beginn, ende, ort, veranstaltung, angelegtAm, geaendertAm, von1, von2] =
        w as [
          string,
          string,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
          string,
          string,
          string,
        ];
      if (this.db.einsaetze.has(id)) throw new Error('UNIQUE constraint failed: einsaetze.id');
      if (this.db.veranstaltungBelegt(veranstaltung, id)) {
        throw new Error('UNIQUE constraint failed: einsaetze.hiorg_veranstaltung_id');
      }
      this.db.einsaetze.set(id, {
        id,
        titel,
        beginn,
        ende,
        ort,
        hiorg_veranstaltung_id: veranstaltung,
        version: 1,
        angelegt_am: angelegtAm,
        geaendert_am: geaendertAm,
        angelegt_von: von1,
        geaendert_von: von2,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE einsaetze')) {
      const [titel, beginn, ende, ort, veranstaltung, geaendertAm, von, id, version] = w as [
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.einsaetze.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      if (this.db.veranstaltungBelegt(veranstaltung, id)) {
        throw new Error('UNIQUE constraint failed: einsaetze.hiorg_veranstaltung_id');
      }
      this.db.einsaetze.set(id, {
        ...bestehend,
        titel,
        beginn,
        ende,
        ort,
        hiorg_veranstaltung_id: veranstaltung,
        geaendert_am: geaendertAm,
        geaendert_von: von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('INSERT INTO vb_vorlagen')) {
      const [id, titel, inhalt, abschnitte, laufzettel, positionen, geaendert_am, geaendert_von] =
        w as [string, string, string, number, number, number, string, string];
      if (this.db.vorlagen.has(id)) throw new Error('UNIQUE constraint failed: vb_vorlagen.id');
      this.db.vorlagen.set(id, {
        id,
        titel,
        inhalt,
        abschnitte,
        laufzettel,
        positionen,
        version: 1,
        geaendert_am,
        geaendert_von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE vb_vorlagen')) {
      const [
        titel,
        inhalt,
        abschnitte,
        laufzettel,
        positionen,
        geaendert_am,
        geaendert_von,
        id,
        version,
      ] = w as [string, string, number, number, number, string, string, string, number];
      const bestehend = this.db.vorlagen.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.vorlagen.set(id, {
        ...bestehend,
        titel,
        inhalt,
        abschnitte,
        laufzettel,
        positionen,
        geaendert_am,
        geaendert_von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM vb_vorlagen')) {
      const [id, version] = w as [string, number];
      const bestehend = this.db.vorlagen.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.vorlagen.delete(id);
      return OK;
    }
    if (this.query.startsWith('INSERT INTO vorbereitungen')) {
      const [
        einsatz_id,
        vorlage_id,
        vorlage_version,
        inhalt,
        laufzettel,
        positionen,
        geaendert_am,
        geaendert_von,
      ] = w as [string, string | null, number | null, string, number, number, string, string];
      if (this.db.vorbereitungen.has(einsatz_id)) {
        throw new Error('UNIQUE constraint failed: vorbereitungen.einsatz_id');
      }
      if (!this.db.einsaetze.has(einsatz_id)) throw new Error('FOREIGN KEY constraint failed');
      this.db.vorbereitungen.set(einsatz_id, {
        einsatz_id,
        vorlage_id,
        vorlage_version,
        inhalt,
        laufzettel,
        positionen,
        version: 1,
        geaendert_am,
        geaendert_von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE vorbereitungen')) {
      const [
        vorlage_id,
        vorlage_version,
        inhalt,
        laufzettel,
        positionen,
        geaendert_am,
        geaendert_von,
        einsatz_id,
        version,
      ] = w as [
        string | null,
        number | null,
        string,
        number,
        number,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.vorbereitungen.get(einsatz_id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.vorbereitungen.set(einsatz_id, {
        ...bestehend,
        vorlage_id,
        vorlage_version,
        inhalt,
        laufzettel,
        positionen,
        geaendert_am,
        geaendert_von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM vorbereitungen')) {
      const [einsatz_id, version] = w as [string, number];
      const bestehend = this.db.vorbereitungen.get(einsatz_id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.vorbereitungen.delete(einsatz_id);
      return OK;
    }
    if (this.query.startsWith('INSERT INTO peps')) {
      const [
        einsatz_id,
        schema,
        vorlage_id,
        inhalt,
        posten,
        positionen,
        besetzt,
        einsatzkraefte,
        geaendert_am,
        geaendert_von,
      ] = w as [
        string,
        number,
        string | null,
        string,
        number,
        number,
        number,
        number,
        string,
        string,
      ];
      if (this.db.peps.has(einsatz_id))
        throw new Error('UNIQUE constraint failed: peps.einsatz_id');
      if (!this.db.einsaetze.has(einsatz_id)) throw new Error('FOREIGN KEY constraint failed');
      this.db.peps.set(einsatz_id, {
        einsatz_id,
        schema,
        vorlage_id,
        inhalt,
        posten,
        positionen,
        besetzt,
        einsatzkraefte,
        version: 1,
        geaendert_am,
        geaendert_von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE peps')) {
      const [
        schema,
        vorlage_id,
        inhalt,
        posten,
        positionen,
        besetzt,
        einsatzkraefte,
        geaendert_am,
        geaendert_von,
        einsatz_id,
        version,
      ] = w as [
        number,
        string | null,
        string,
        number,
        number,
        number,
        number,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.peps.get(einsatz_id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.peps.set(einsatz_id, {
        ...bestehend,
        schema,
        vorlage_id,
        inhalt,
        posten,
        positionen,
        besetzt,
        einsatzkraefte,
        geaendert_am,
        geaendert_von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM peps')) {
      const [einsatz_id, version] = w as [string, number];
      const bestehend = this.db.peps.get(einsatz_id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.peps.delete(einsatz_id);
      return OK;
    }
    if (this.query.startsWith('INSERT INTO pep_vorlagen')) {
      const [id, titel, inhalt, posten, positionen, geaendert_am, geaendert_von] = w as [
        string,
        string,
        string,
        number,
        number,
        string,
        string,
      ];
      if (this.db.pepVorlagen.has(id)) throw new Error('UNIQUE constraint failed: pep_vorlagen.id');
      this.db.pepVorlagen.set(id, {
        id,
        titel,
        inhalt,
        posten,
        positionen,
        version: 1,
        geaendert_am,
        geaendert_von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE pep_vorlagen')) {
      const [titel, inhalt, posten, positionen, geaendert_am, geaendert_von, id, version] = w as [
        string,
        string,
        number,
        number,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.pepVorlagen.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.pepVorlagen.set(id, {
        ...bestehend,
        titel,
        inhalt,
        posten,
        positionen,
        geaendert_am,
        geaendert_von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM pep_vorlagen')) {
      const [id, version] = w as [string, number];
      const bestehend = this.db.pepVorlagen.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.pepVorlagen.delete(id);
      return OK;
    }
    throw new Error(`FakeEinsatzplanungDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const w = this.werte;
    const als = <U>(wert: U | undefined): T | null => (wert as unknown as T | undefined) ?? null;
    if (this.query.startsWith('SELECT id FROM einsaetze WHERE hiorg_veranstaltung_id = ?')) {
      if (this.db.vorabpruefungUebergehen) return null;
      const [veranstaltung, ausser] = w as [string, string];
      const treffer = [...this.db.einsaetze.values()].find(
        (zeile) => zeile.hiorg_veranstaltung_id === veranstaltung && zeile.id !== ausser,
      );
      return als(treffer && { id: treffer.id });
    }
    if (this.query.startsWith('SELECT id FROM einsaetze WHERE id = ?')) {
      return als(this.db.einsaetze.has(w[0] as string) ? { id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT * FROM einsaetze WHERE id = ?')) {
      return als(this.db.einsaetze.get(w[0] as string));
    }
    if (
      this.query.startsWith(
        'SELECT vorlage_id, vorlage_version, inhalt, version FROM vorbereitungen',
      )
    ) {
      return als(this.db.vorbereitungen.get(w[0] as string));
    }
    if (this.query.startsWith('SELECT schema, vorlage_id, inhalt, version FROM peps')) {
      return als(this.db.peps.get(w[0] as string));
    }
    if (this.query.startsWith('SELECT einsatz_id FROM peps WHERE einsatz_id = ?')) {
      return als(this.db.peps.has(w[0] as string) ? { einsatz_id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT id, titel, inhalt, version FROM pep_vorlagen WHERE id = ?')) {
      return als(this.db.pepVorlagen.get(w[0] as string));
    }
    if (this.query.startsWith('SELECT id FROM pep_vorlagen WHERE id = ?')) {
      return als(this.db.pepVorlagen.has(w[0] as string) ? { id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT einsatz_id FROM vorbereitungen WHERE einsatz_id = ?')) {
      return als(this.db.vorbereitungen.has(w[0] as string) ? { einsatz_id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT id, titel, inhalt, version FROM vb_vorlagen WHERE id = ?')) {
      return als(this.db.vorlagen.get(w[0] as string));
    }
    if (this.query.startsWith('SELECT id FROM vb_vorlagen WHERE id = ?')) {
      return als(this.db.vorlagen.has(w[0] as string) ? { id: w[0] } : undefined);
    }
    throw new Error(`FakeEinsatzplanungDb: unbekannte first()-Anweisung: ${this.query}`);
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }> {
    if (this.query.startsWith('SELECT e.*, v.laufzettel AS vb_laufzettel')) {
      this.db.listenabfragen += 1;
      const zeilen = [...this.db.einsaetze.values()]
        .sort(
          (a, b) =>
            (b.beginn ?? '').localeCompare(a.beginn ?? '') || a.titel.localeCompare(b.titel),
        )
        .map((zeile) => {
          const vb = this.db.vorbereitungen.get(zeile.id);
          const pep = this.db.peps.get(zeile.id);
          return {
            ...zeile,
            vb_laufzettel: vb?.laufzettel ?? null,
            vb_positionen: vb?.positionen ?? null,
            pep_posten: pep?.posten ?? null,
            pep_positionen: pep?.positionen ?? null,
            pep_besetzt: pep?.besetzt ?? null,
          };
        });
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id, titel, version, abschnitte, laufzettel, positionen')) {
      const zeilen = [...this.db.vorlagen.values()].sort((a, b) => a.titel.localeCompare(b.titel));
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id, titel, version, posten, positionen, geaendert_am')) {
      const zeilen = [...this.db.pepVorlagen.values()].sort((a, b) =>
        a.titel.localeCompare(b.titel),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeEinsatzplanungDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
