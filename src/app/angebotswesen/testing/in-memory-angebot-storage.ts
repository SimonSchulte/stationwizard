import { Angebot } from '../models/angebot.model';
import {
  AngebotKonfliktFehler,
  AngebotMitVersion,
  AngebotStorage,
} from '../storage/angebot-storage';

let laufendeId = 0;
function naechsteVersion(): string {
  laufendeId += 1;
  return `version-${laufendeId}`;
}

/**
 * Referenzadapter für Tests. Bildet dieselbe Versionsregel wie der echte
 * Worker-Endpunkt nach, analog zu `fahrzeuge/testing/in-memory-fahrzeug-storage.ts`.
 */
export class InMemoryAngebotStorage implements AngebotStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';

  private readonly angebote = new Map<string, { daten: Angebot; version: string }>();

  async ladeAngebote(): Promise<Angebot[]> {
    return [...this.angebote.values()].map((eintrag) => ({ ...eintrag.daten }));
  }

  async ladeAngebot(id: string): Promise<AngebotMitVersion | null> {
    const eintrag = this.angebote.get(id);
    return eintrag ? { daten: { ...eintrag.daten }, version: eintrag.version } : null;
  }

  async speichereAngebot(angebot: Angebot, version: string | null): Promise<string> {
    const bestehend = this.angebote.get(angebot.id);
    if (version === null) {
      if (bestehend) throw new AngebotKonfliktFehler(angebot.id);
    } else if (!bestehend || bestehend.version !== version) {
      throw new AngebotKonfliktFehler(angebot.id);
    }
    const neueVersion = naechsteVersion();
    this.angebote.set(angebot.id, { daten: { ...angebot }, version: neueVersion });
    return neueVersion;
  }

  async loescheAngebot(id: string): Promise<void> {
    this.angebote.delete(id);
  }

  /** Nur für Tests: Angebote direkt vorbelegen. */
  _vorbelegen(angebot: Angebot): void {
    this.angebote.set(angebot.id, { daten: { ...angebot }, version: naechsteVersion() });
  }
}
