import { PreiskatalogEintrag } from '../models/preiskatalog.model';
import {
  PreiskatalogEintragEingabe,
  PreiskatalogKonfliktFehler,
  PreiskatalogStorage,
} from '../storage/preiskatalog-storage';

/**
 * Referenzadapter für Tests. Bildet dieselbe Versionsregel wie der echte
 * Worker-Endpunkt nach, analog zu `fahrzeuge/testing/in-memory-fahrzeug-storage.ts`.
 */
export class InMemoryPreiskatalogStorage implements PreiskatalogStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';

  private readonly eintraege = new Map<string, PreiskatalogEintrag>();

  constructor(private readonly jetzigeIdentitaet = () => 'test@example.invalid') {}

  async ladeEintraege(): Promise<PreiskatalogEintrag[]> {
    return [...this.eintraege.values()].map((eintrag) => ({ ...eintrag }));
  }

  async speichereEintrag(
    eingabe: PreiskatalogEintragEingabe,
    version: number | null,
  ): Promise<PreiskatalogEintrag> {
    const bestehend = this.eintraege.get(eingabe.id);
    if (version === null) {
      if (bestehend) throw new PreiskatalogKonfliktFehler(eingabe.id);
    } else if (!bestehend || bestehend.version !== version) {
      throw new PreiskatalogKonfliktFehler(eingabe.id);
    }
    const gespeichert: PreiskatalogEintrag = {
      ...eingabe,
      geaendertAm: new Date().toISOString(),
      geaendertVon: this.jetzigeIdentitaet(),
      version: (bestehend?.version ?? 0) + 1,
    };
    this.eintraege.set(eingabe.id, gespeichert);
    return { ...gespeichert };
  }

  async loescheEintrag(id: string): Promise<void> {
    this.eintraege.delete(id);
  }

  /** Nur für Tests: Einträge direkt vorbelegen. */
  _vorbelegen(eintraege: PreiskatalogEintrag[]): void {
    for (const eintrag of eintraege) this.eintraege.set(eintrag.id, { ...eintrag });
  }
}
