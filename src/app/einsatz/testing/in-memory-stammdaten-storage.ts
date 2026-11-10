import {
  Artikel,
  ArtikelEingabe,
  Kiste,
  KisteEingabe,
  Lager,
  LagerEingabe,
} from '../models/stammdaten.model';
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
  private readonly kisten = new Map<string, Kiste>();

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
    if (
      [...this.artikel.values()].some((a) => a.lagerId === id) ||
      [...this.kisten.values()].some((k) => k.lagerId === id)
    ) {
      throw new StammdatenInNutzungFehler('lager');
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
    if ([...this.kisten.values()].some((k) => k.inhalt.some((p) => p.artikelId === id))) {
      throw new StammdatenInNutzungFehler('artikel');
    }
    this.artikel.delete(id);
  }

  async ladeKisten(): Promise<Kiste[]> {
    return [...this.kisten.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((k) => ({ ...k, inhalt: k.inhalt.map((p) => ({ ...p })) }));
  }

  async speichereKiste(eingabe: KisteEingabe, version: number | null): Promise<Kiste> {
    this.schreibzugriffe += 1;
    const bestehend = this.kisten.get(eingabe.id);
    if (version === null ? bestehend : !bestehend || bestehend.version !== version) {
      throw new StammdatenKonfliktFehler();
    }
    const name = eingabe.name.trim().replace(/\s+/g, ' ');
    if (
      [...this.kisten.values()].some(
        (k) => k.id !== eingabe.id && lagerSchluessel(k.name) === lagerSchluessel(name),
      )
    ) {
      throw new StammdatenNameVergebenFehler('kiste');
    }
    const gespeichert: Kiste = {
      ...eingabe,
      name,
      inhalt: eingabe.inhalt.map((p) => ({ ...p })),
      version: (bestehend?.version ?? 0) + 1,
      geaendertAm: new Date().toISOString(),
      geaendertVon: 'test@example.invalid',
    };
    this.kisten.set(gespeichert.id, gespeichert);
    return { ...gespeichert, inhalt: gespeichert.inhalt.map((p) => ({ ...p })) };
  }

  async loescheKiste(id: string, version: number): Promise<void> {
    this.schreibzugriffe += 1;
    const bestehend = this.kisten.get(id);
    if (!bestehend || bestehend.version !== version) throw new StammdatenKonfliktFehler();
    this.kisten.delete(id);
  }

  /** Nur für Tests: Zeilen direkt vorbelegen. */
  _vorbelegen(lager: Lager[], artikel: Artikel[] = [], kisten: Kiste[] = []): void {
    for (const l of lager) this.lager.set(l.id, { ...l });
    for (const a of artikel) this.artikel.set(a.id, { ...a });
    for (const k of kisten)
      this.kisten.set(k.id, { ...k, inhalt: k.inhalt.map((p) => ({ ...p })) });
  }
}
