import { anzahlArtikel, Pruefvorlage, PruefvorlageKopf } from '../models/pruefvorlage.model';
import {
  PruefvorlageMitVersion,
  PruefvorlageStorage,
  VorlageInBenutzungFehler,
  VorlageKonfliktFehler,
} from '../storage/pruefvorlage-storage';

/**
 * Zweite, vollständige Umsetzung von `PruefvorlageStorage` im Speicher – für
 * Tests und als Beleg, dass der Vertrag ohne Worker erfüllbar ist. Bildet die
 * optimistische Sperre nach, damit ein Test den Konflikt echt erlebt.
 */
export class InMemoryPruefvorlageStorage implements PruefvorlageStorage {
  readonly bezeichnung = 'Prüfvorlagen (Speicher)';

  private readonly vorlagen = new Map<string, { daten: Pruefvorlage; version: number }>();

  /** Vorlagen-Ids, die als "von einem Behälter benutzt" gelten sollen. */
  readonly inBenutzung = new Set<string>();

  vorbelegen(vorlage: Pruefvorlage, version = 1): void {
    this.vorlagen.set(vorlage.id, { daten: structuredClone(vorlage), version });
  }

  async ladeKoepfe(): Promise<PruefvorlageKopf[]> {
    return [...this.vorlagen.values()]
      .map(({ daten }) => ({
        id: daten.id,
        bezeichnung: daten.bezeichnung,
        beschreibung: daten.beschreibung,
        grundlage: daten.grundlage,
        anzahlFaecher: daten.faecher.length,
        anzahlArtikel: anzahlArtikel(daten.faecher),
        geaendertAm: daten.geaendertAm,
        geaendertVon: daten.geaendertVon,
      }))
      .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung));
  }

  async ladeVorlage(id: string): Promise<PruefvorlageMitVersion | null> {
    const eintrag = this.vorlagen.get(id);
    if (!eintrag) return null;
    return { daten: structuredClone(eintrag.daten), version: `"${eintrag.version}"` };
  }

  async speichereVorlage(vorlage: Pruefvorlage, version: string | null): Promise<string> {
    if (version === null) {
      if (this.vorlagen.has(vorlage.id)) throw new VorlageKonfliktFehler(vorlage.id);
      this.vorlagen.set(vorlage.id, { daten: structuredClone(vorlage), version: 1 });
      return '"1"';
    }
    const eintrag = this.vorlagen.get(vorlage.id);
    if (!eintrag || `"${eintrag.version}"` !== version) {
      throw new VorlageKonfliktFehler(vorlage.id);
    }
    eintrag.daten = structuredClone(vorlage);
    eintrag.version += 1;
    return `"${eintrag.version}"`;
  }

  async loescheVorlage(id: string): Promise<void> {
    if (this.inBenutzung.has(id)) throw new VorlageInBenutzungFehler(id);
    this.vorlagen.delete(id);
  }
}
