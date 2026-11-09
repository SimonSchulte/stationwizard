import { Artikel, ArtikelEingabe, Lager, LagerEingabe } from '../models/stammdaten.model';
import { lagerSchluessel } from '../services/lager';
import {
  StammdatenInNutzungFehler,
  StammdatenKonfliktFehler,
  StammdatenNameVergebenFehler,
  StammdatenStorage,
} from '../storage/stammdaten-storage';

/** Referenzadapter für Tests: bildet Versions-, Namens- und Nutzungsregeln des Workers nach. */
export class InMemoryStammdatenStorage implements StammdatenStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';
  /** Zählt Schreibzugriffe, damit Tests „kein unnötiges Speichern“ prüfen können. */
  schreibzugriffe = 0;

  private readonly lager = new Map<string, Lager>();
  private readonly artikel = new Map<string, Artikel>();

  async ladeLager(): Promise<Lager[]> {
    return [...this.lager.values()]
      .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name))
      .map((l) => ({ ...l }));
  }

  async speichereLager(eingabe: LagerEingabe, version: number | null): Promise<Lager> {
    this.schreibzugriffe += 1;
    const bestehend = this.lager.get(eingabe.id);
    if (version === null ? bestehend : !bestehend || bestehend.version !== version) {
      throw new StammdatenKonfliktFehler();
    }
    const name = eingabe.name.trim().replace(/\s+/g, ' ');
    if (
      [...this.lager.values()].some(
        (l) => l.id !== eingabe.id && lagerSchluessel(l.name) === lagerSchluessel(name),
      )
    ) {
      throw new StammdatenNameVergebenFehler('lager');
    }
    const gespeichert: Lager = {
      id: eingabe.id,
      name,
      reihenfolge:
        bestehend?.reihenfolge ??
        [...this.lager.values()].reduce((h, l) => Math.max(h, l.reihenfolge), 0) + 1,
      version: (bestehend?.version ?? 0) + 1,
      geaendertAm: new Date().toISOString(),
      geaendertVon: 'test@example.invalid',
    };
    this.lager.set(gespeichert.id, gespeichert);
    return { ...gespeichert };
  }

  async loescheLager(id: string, version: number): Promise<void> {
    this.schreibzugriffe += 1;
    const bestehend = this.lager.get(id);
    if (!bestehend || bestehend.version !== version) throw new StammdatenKonfliktFehler();
    if ([...this.artikel.values()].some((a) => a.lagerId === id)) {
      throw new StammdatenInNutzungFehler();
    }
    this.lager.delete(id);
  }

  async setzeLagerReihenfolge(ids: readonly string[]): Promise<Lager[]> {
    this.schreibzugriffe += 1;
    if (ids.length !== this.lager.size || !ids.every((id) => this.lager.has(id))) {
      throw new StammdatenKonfliktFehler();
    }
    ids.forEach((id, index) => {
      const l = this.lager.get(id);
      if (l) this.lager.set(id, { ...l, reihenfolge: index + 1 });
    });
    return this.ladeLager();
  }

  async ladeArtikel(): Promise<Artikel[]> {
    return [...this.artikel.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ ...a }));
  }

  async speichereArtikel(eingabe: ArtikelEingabe, version: number | null): Promise<Artikel> {
    this.schreibzugriffe += 1;
    const bestehend = this.artikel.get(eingabe.id);
    if (version === null ? bestehend : !bestehend || bestehend.version !== version) {
      throw new StammdatenKonfliktFehler();
    }
    const name = eingabe.name.trim().replace(/\s+/g, ' ');
    if (
      [...this.artikel.values()].some(
        (a) => a.id !== eingabe.id && lagerSchluessel(a.name) === lagerSchluessel(name),
      )
    ) {
      throw new StammdatenNameVergebenFehler('artikel');
    }
    const gespeichert: Artikel = {
      ...eingabe,
      name,
      version: (bestehend?.version ?? 0) + 1,
      geaendertAm: new Date().toISOString(),
      geaendertVon: 'test@example.invalid',
    };
    this.artikel.set(gespeichert.id, gespeichert);
    return { ...gespeichert };
  }

  async loescheArtikel(id: string, version: number): Promise<void> {
    this.schreibzugriffe += 1;
    const bestehend = this.artikel.get(id);
    if (!bestehend || bestehend.version !== version) throw new StammdatenKonfliktFehler();
    this.artikel.delete(id);
  }

  /** Nur für Tests: Zeilen direkt vorbelegen. */
  _vorbelegen(lager: Lager[], artikel: Artikel[] = []): void {
    for (const l of lager) this.lager.set(l.id, { ...l });
    for (const a of artikel) this.artikel.set(a.id, { ...a });
  }
}
