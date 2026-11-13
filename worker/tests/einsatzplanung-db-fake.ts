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

interface LagerZeile {
  id: string;
  name: string;
  name_vergleich: string;
  plaetze: string;
  reihenfolge: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

interface ArtikelZeile {
  id: string;
  name: string;
  name_vergleich: string;
  einheit: string;
  lager_id: string | null;
  platz_id: string | null;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

interface KisteZeile {
  id: string;
  name: string;
  name_vergleich: string;
  lager_id: string | null;
  platz_id: string | null;
  inhalt: string;
  positionen: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

interface AufbauZeile {
  einsatz_id: string;
  vorlage_id: string | null;
  vorlage_version: number | null;
  inhalt: string;
  einheiten: number;
  kisten: number;
  positionen: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

interface AufbauVorlageZeile {
  id: string;
  titel: string;
  inhalt: string;
  einheiten: number;
  kisten: number;
  positionen: number;
  version: number;
  geaendert_am: string;
  geaendert_von: string;
}

export class FakeEinsatzplanungDb {
  aufbauten = new Map<string, AufbauZeile>();
  aufbauVorlagen = new Map<string, AufbauVorlageZeile>();
  kisten = new Map<string, KisteZeile>();
  lager = new Map<string, LagerZeile>();
  artikel = new Map<string, ArtikelZeile>();
  /** Zählt die `db.batch()`-Aufrufe: die Lagerreihenfolge muss mit genau einem auskommen. */
  batches = 0;
  einsaetze = new Map<string, EinsatzZeile>();
  peps = new Map<string, PepZeile>();
  pepVorlagen = new Map<string, PepVorlageZeile>();
  /** Zählt Lesezugriffe der Einsatzliste: sie muss mit genau einer Abfrage auskommen. */
  listenabfragen = 0;
  /** Simuliert ein Rennen: die Vorabprüfung der Veranstaltung findet nichts. */
  vorabpruefungUebergehen = false;

  async batch(anweisungen: FakeStatement[]): Promise<unknown[]> {
    this.batches += 1;
    const ergebnisse: unknown[] = [];
    for (const anweisung of anweisungen) ergebnisse.push(await anweisung.run());
    return ergebnisse;
  }

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
    if (this.query.startsWith('INSERT INTO lager')) {
      const [id, name, vergleich, plaetze, reihenfolge, am, von] = w as [
        string,
        string,
        string,
        string,
        number,
        string,
        string,
      ];
      if (this.db.lager.has(id)) throw new Error('UNIQUE constraint failed: lager.id');
      if ([...this.db.lager.values()].some((z) => z.name_vergleich === vergleich)) {
        throw new Error('UNIQUE constraint failed: lager.name_vergleich');
      }
      this.db.lager.set(id, {
        id,
        name,
        name_vergleich: vergleich,
        plaetze,
        reihenfolge,
        version: 1,
        geaendert_am: am,
        geaendert_von: von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE lager SET name = ?')) {
      const [name, vergleich, plaetze, am, von, id, version] = w as [
        string,
        string,
        string,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.lager.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      if ([...this.db.lager.values()].some((z) => z.id !== id && z.name_vergleich === vergleich)) {
        throw new Error('UNIQUE constraint failed: lager.name_vergleich');
      }
      this.db.lager.set(id, {
        ...bestehend,
        name,
        name_vergleich: vergleich,
        plaetze,
        geaendert_am: am,
        geaendert_von: von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE lager SET reihenfolge = ?')) {
      const [reihenfolge, am, von, id] = w as [number, string, string, string];
      const bestehend = this.db.lager.get(id);
      if (!bestehend) return KEIN_TREFFER;
      this.db.lager.set(id, { ...bestehend, reihenfolge, geaendert_am: am, geaendert_von: von });
      return OK;
    }
    if (this.query.startsWith('INSERT INTO kisten')) {
      const [id, name, vergleich, lagerId, platzId, inhalt, positionen, am, von] = w as [
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        number,
        string,
        string,
      ];
      if (this.db.kisten.has(id)) throw new Error('UNIQUE constraint failed: kisten.id');
      if ([...this.db.kisten.values()].some((z) => z.name_vergleich === vergleich)) {
        throw new Error('UNIQUE constraint failed: kisten.name_vergleich');
      }
      if (lagerId !== null && !this.db.lager.has(lagerId)) {
        throw new Error('FOREIGN KEY constraint failed');
      }
      this.db.kisten.set(id, {
        id,
        name,
        name_vergleich: vergleich,
        lager_id: lagerId,
        platz_id: platzId,
        inhalt,
        positionen,
        version: 1,
        geaendert_am: am,
        geaendert_von: von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE kisten SET name = ?')) {
      const [name, vergleich, lagerId, platzId, inhalt, positionen, am, von, id, version] = w as [
        string,
        string,
        string | null,
        string | null,
        string,
        number,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.kisten.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      if ([...this.db.kisten.values()].some((z) => z.id !== id && z.name_vergleich === vergleich)) {
        throw new Error('UNIQUE constraint failed: kisten.name_vergleich');
      }
      if (lagerId !== null && !this.db.lager.has(lagerId)) {
        throw new Error('FOREIGN KEY constraint failed');
      }
      this.db.kisten.set(id, {
        ...bestehend,
        name,
        name_vergleich: vergleich,
        lager_id: lagerId,
        platz_id: platzId,
        inhalt,
        positionen,
        geaendert_am: am,
        geaendert_von: von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM kisten')) {
      const [id, version] = w as [string, number];
      const bestehend = this.db.kisten.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.kisten.delete(id);
      return OK;
    }
    if (this.query.startsWith('DELETE FROM lager')) {
      const [id, version] = w as [string, number];
      const bestehend = this.db.lager.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      if ([...this.db.artikel.values()].some((z) => z.lager_id === id)) {
        throw new Error('FOREIGN KEY constraint failed');
      }
      this.db.lager.delete(id);
      return OK;
    }
    if (this.query.startsWith('INSERT INTO artikel')) {
      const [id, name, vergleich, einheit, lagerId, platzId, am, von] = w as [
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string,
      ];
      if (this.db.artikel.has(id)) throw new Error('UNIQUE constraint failed: artikel.id');
      if ([...this.db.artikel.values()].some((z) => z.name_vergleich === vergleich)) {
        throw new Error('UNIQUE constraint failed: artikel.name_vergleich');
      }
      if (lagerId !== null && !this.db.lager.has(lagerId)) {
        throw new Error('FOREIGN KEY constraint failed');
      }
      this.db.artikel.set(id, {
        id,
        name,
        name_vergleich: vergleich,
        einheit,
        lager_id: lagerId,
        platz_id: platzId,
        version: 1,
        geaendert_am: am,
        geaendert_von: von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE artikel SET name = ?')) {
      const [name, vergleich, einheit, lagerId, platzId, am, von, id, version] = w as [
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.artikel.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      if (
        [...this.db.artikel.values()].some((z) => z.id !== id && z.name_vergleich === vergleich)
      ) {
        throw new Error('UNIQUE constraint failed: artikel.name_vergleich');
      }
      if (lagerId !== null && !this.db.lager.has(lagerId)) {
        throw new Error('FOREIGN KEY constraint failed');
      }
      this.db.artikel.set(id, {
        ...bestehend,
        name,
        name_vergleich: vergleich,
        einheit,
        lager_id: lagerId,
        platz_id: platzId,
        geaendert_am: am,
        geaendert_von: von,
        version: bestehend.version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM artikel')) {
      const [id, version] = w as [string, number];
      const bestehend = this.db.artikel.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.artikel.delete(id);
      return OK;
    }
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
    if (this.query.startsWith('INSERT INTO aufbauten')) {
      const [
        einsatz_id,
        vorlage_id,
        vorlage_version,
        inhalt,
        einheiten,
        kisten,
        positionen,
        am,
        von,
      ] = w as [
        string,
        string | null,
        number | null,
        string,
        number,
        number,
        number,
        string,
        string,
      ];
      if (this.db.aufbauten.has(einsatz_id)) {
        throw new Error('UNIQUE constraint failed: aufbauten.einsatz_id');
      }
      this.db.aufbauten.set(einsatz_id, {
        einsatz_id,
        vorlage_id,
        vorlage_version,
        inhalt,
        einheiten,
        kisten,
        positionen,
        version: 1,
        geaendert_am: am,
        geaendert_von: von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE aufbauten')) {
      const [
        vorlage_id,
        vorlage_version,
        inhalt,
        einheiten,
        kisten,
        positionen,
        am,
        von,
        einsatz_id,
        version,
      ] = w as [
        string | null,
        number | null,
        string,
        number,
        number,
        number,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.aufbauten.get(einsatz_id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.aufbauten.set(einsatz_id, {
        ...bestehend,
        vorlage_id,
        vorlage_version,
        inhalt,
        einheiten,
        kisten,
        positionen,
        geaendert_am: am,
        geaendert_von: von,
        version: version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM aufbauten')) {
      const [einsatz_id, version] = w as [string, number];
      const bestehend = this.db.aufbauten.get(einsatz_id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.aufbauten.delete(einsatz_id);
      return OK;
    }
    if (this.query.startsWith('INSERT INTO aufbau_vorlagen')) {
      const [id, titel, inhalt, einheiten, kisten, positionen, am, von] = w as [
        string,
        string,
        string,
        number,
        number,
        number,
        string,
        string,
      ];
      if (this.db.aufbauVorlagen.has(id)) {
        throw new Error('UNIQUE constraint failed: aufbau_vorlagen.id');
      }
      this.db.aufbauVorlagen.set(id, {
        id,
        titel,
        inhalt,
        einheiten,
        kisten,
        positionen,
        version: 1,
        geaendert_am: am,
        geaendert_von: von,
      });
      return OK;
    }
    if (this.query.startsWith('UPDATE aufbau_vorlagen')) {
      const [titel, inhalt, einheiten, kisten, positionen, am, von, id, version] = w as [
        string,
        string,
        number,
        number,
        number,
        string,
        string,
        string,
        number,
      ];
      const bestehend = this.db.aufbauVorlagen.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.aufbauVorlagen.set(id, {
        ...bestehend,
        titel,
        inhalt,
        einheiten,
        kisten,
        positionen,
        geaendert_am: am,
        geaendert_von: von,
        version: version + 1,
      });
      return OK;
    }
    if (this.query.startsWith('DELETE FROM aufbau_vorlagen')) {
      const [id, version] = w as [string, number];
      const bestehend = this.db.aufbauVorlagen.get(id);
      if (!bestehend || bestehend.version !== version) return KEIN_TREFFER;
      this.db.aufbauVorlagen.delete(id);
      return OK;
    }
    throw new Error(`FakeEinsatzplanungDb: unbekannte run()-Anweisung: ${this.query}`);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const w = this.werte;
    const als = <U>(wert: U | undefined): T | null => (wert as unknown as T | undefined) ?? null;
    if (this.query.startsWith('SELECT COUNT(*) AS n, COALESCE(MAX(reihenfolge), 0) AS hoechste')) {
      const zeilen = [...this.db.lager.values()];
      return als({
        n: zeilen.length,
        hoechste: zeilen.reduce((h, z) => Math.max(h, z.reihenfolge), 0),
      });
    }
    {
      const imBlock = /^SELECT COUNT\(\*\) AS n FROM (artikel|lager) WHERE id IN \(/.exec(
        this.query,
      );
      if (imBlock) {
        const quelle = imBlock[1] === 'artikel' ? this.db.artikel : this.db.lager;
        return als({ n: (w as string[]).filter((id) => quelle.has(id)).length });
      }
    }
    if (
      /^SELECT COUNT\(\*\) AS n FROM aufbau(ten|_vorlagen) WHERE inhalt LIKE \?/.test(this.query)
    ) {
      const muster = (w[0] as string).replace(/^%|%$/g, '');
      const quelle = this.query.includes('aufbauten') ? this.db.aufbauten : this.db.aufbauVorlagen;
      return als({ n: [...quelle.values()].filter((z) => z.inhalt.includes(muster)).length });
    }
    if (
      this.query.startsWith('SELECT vorlage_id, vorlage_version, inhalt, version FROM aufbauten')
    ) {
      return als(this.db.aufbauten.get(w[0] as string));
    }
    if (this.query.startsWith('SELECT einsatz_id FROM aufbauten WHERE einsatz_id = ?')) {
      return als(this.db.aufbauten.has(w[0] as string) ? { einsatz_id: w[0] } : undefined);
    }
    if (
      this.query.startsWith('SELECT id, titel, inhalt, version FROM aufbau_vorlagen WHERE id = ?')
    ) {
      return als(this.db.aufbauVorlagen.get(w[0] as string));
    }
    if (this.query.startsWith('SELECT id FROM aufbau_vorlagen WHERE id = ?')) {
      return als(this.db.aufbauVorlagen.has(w[0] as string) ? { id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT plaetze FROM lager WHERE id = ?')) {
      return als(this.db.lager.get(w[0] as string));
    }
    if (this.query.startsWith('SELECT COUNT(*) AS n FROM artikel WHERE platz_id = ?')) {
      return als({ n: [...this.db.artikel.values()].filter((z) => z.platz_id === w[0]).length });
    }
    if (this.query.startsWith('SELECT COUNT(*) AS n FROM kisten WHERE platz_id = ?')) {
      return als({ n: [...this.db.kisten.values()].filter((z) => z.platz_id === w[0]).length });
    }
    if (this.query.startsWith('SELECT COUNT(*) AS n FROM kisten WHERE lager_id = ?')) {
      return als({ n: [...this.db.kisten.values()].filter((z) => z.lager_id === w[0]).length });
    }
    if (this.query.startsWith('SELECT COUNT(*) AS n FROM kisten WHERE inhalt LIKE ?')) {
      const muster = (w[0] as string).replace(/^%|%$/g, '');
      return als({
        n: [...this.db.kisten.values()].filter((z) => z.inhalt.includes(muster)).length,
      });
    }
    if (this.query.startsWith('SELECT COUNT(*) AS n FROM kisten')) {
      return als({ n: this.db.kisten.size });
    }
    if (this.query.startsWith('SELECT id FROM kisten WHERE id = ?')) {
      return als(this.db.kisten.has(w[0] as string) ? { id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT COUNT(*) AS n FROM artikel WHERE lager_id = ?')) {
      const n = [...this.db.artikel.values()].filter((z) => z.lager_id === w[0]).length;
      return als({ n });
    }
    if (this.query.startsWith('SELECT COUNT(*) AS n FROM artikel')) {
      return als({ n: this.db.artikel.size });
    }
    if (this.query.startsWith('SELECT id FROM lager WHERE id = ?')) {
      return als(this.db.lager.has(w[0] as string) ? { id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT id FROM artikel WHERE id = ?')) {
      return als(this.db.artikel.has(w[0] as string) ? { id: w[0] } : undefined);
    }
    if (this.query.startsWith('SELECT id, name, plaetze, reihenfolge, version')) {
      return als(this.db.lager.get(w[0] as string));
    }
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
    throw new Error(`FakeEinsatzplanungDb: unbekannte first()-Anweisung: ${this.query}`);
  }

  async all<T = Record<string, unknown>>(): Promise<{ success: true; results: T[] }> {
    if (this.query.startsWith('SELECT id, name, lager_id, platz_id, inhalt, version')) {
      const zeilen = [...this.db.kisten.values()].sort((a, b) => a.name.localeCompare(b.name));
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id FROM artikel WHERE id IN (')) {
      const zeilen = (this.werte as string[])
        .filter((id) => this.db.artikel.has(id))
        .map((id) => ({ id }));
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id, plaetze FROM lager WHERE id IN (')) {
      const zeilen = (this.werte as string[])
        .map((id) => this.db.lager.get(id))
        .filter((z) => z !== undefined);
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id, name, plaetze, reihenfolge, version')) {
      const zeilen = [...this.db.lager.values()].sort(
        (a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id, name, einheit, lager_id, platz_id, version')) {
      const zeilen = [...this.db.artikel.values()].sort((a, b) => a.name.localeCompare(b.name));
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT e.*, a.einheiten AS aufbau_einheiten')) {
      this.db.listenabfragen += 1;
      const zeilen = [...this.db.einsaetze.values()]
        .sort(
          (a, b) =>
            (b.beginn ?? '').localeCompare(a.beginn ?? '') || a.titel.localeCompare(b.titel),
        )
        .map((zeile) => {
          const aufbau = this.db.aufbauten.get(zeile.id);
          const pep = this.db.peps.get(zeile.id);
          return {
            ...zeile,
            aufbau_einheiten: aufbau?.einheiten ?? null,
            aufbau_kisten: aufbau?.kisten ?? null,
            aufbau_positionen: aufbau?.positionen ?? null,
            pep_posten: pep?.posten ?? null,
            pep_positionen: pep?.positionen ?? null,
            pep_besetzt: pep?.besetzt ?? null,
          };
        });
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id, titel, version, posten, positionen, geaendert_am')) {
      const zeilen = [...this.db.pepVorlagen.values()].sort((a, b) =>
        a.titel.localeCompare(b.titel),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    if (this.query.startsWith('SELECT id, titel, version, einheiten, kisten, positionen')) {
      const zeilen = [...this.db.aufbauVorlagen.values()].sort((a, b) =>
        a.titel.localeCompare(b.titel),
      );
      return { success: true, results: zeilen as unknown as T[] };
    }
    throw new Error(`FakeEinsatzplanungDb: unbekannte all()-Anweisung: ${this.query}`);
  }
}
