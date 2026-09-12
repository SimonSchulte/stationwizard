import { AblesungEingabe, Fahrzeugstamm, Kilometerstand } from '../models/fahrzeug.model';
import { FahrzeugKonfliktFehler, FahrzeugStorage } from '../storage/fahrzeug-storage';

let laufendeId = 0;
function naechsteId(praefix: string): string {
  laufendeId += 1;
  return `${praefix}-${laufendeId}`;
}

/**
 * Referenzadapter für Tests. Bildet dieselben Regeln nach wie ein echtes
 * Backend (Versionsprüfung, serverseitige Identität), damit Fachtests
 * unabhängig von der späteren Backendentscheidung bleiben.
 */
export class InMemoryFahrzeugStorage implements FahrzeugStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';

  private readonly fahrzeuge = new Map<string, { daten: Fahrzeugstamm; version: string }>();
  private readonly ablesungen = new Map<string, Kilometerstand[]>();

  constructor(private readonly jetzigeIdentitaet = () => 'test@example.invalid') {}

  async ladeFahrzeuge(): Promise<Fahrzeugstamm[]> {
    return [...this.fahrzeuge.values()].map((eintrag) => ({ ...eintrag.daten }));
  }

  async ladeFahrzeug(id: string): Promise<Fahrzeugstamm | null> {
    const eintrag = this.fahrzeuge.get(id);
    return eintrag ? { ...eintrag.daten } : null;
  }

  async speichereFahrzeug(fahrzeug: Fahrzeugstamm, version: string | null): Promise<string> {
    const bestehend = this.fahrzeuge.get(fahrzeug.id);
    if (version === null) {
      if (bestehend) {
        throw new FahrzeugKonfliktFehler(fahrzeug.id);
      }
    } else if (!bestehend || bestehend.version !== version) {
      throw new FahrzeugKonfliktFehler(fahrzeug.id);
    }
    const neueVersion = naechsteId('version');
    this.fahrzeuge.set(fahrzeug.id, { daten: { ...fahrzeug }, version: neueVersion });
    return neueVersion;
  }

  async ladeAblesungen(fahrzeugId: string, vonJahr?: number): Promise<Kilometerstand[]> {
    const alle = this.ablesungen.get(fahrzeugId) ?? [];
    const gefiltert =
      vonJahr === undefined
        ? alle
        : alle.filter((a) => Number(a.abgelesenAm.slice(0, 4)) >= vonJahr);
    return gefiltert.map((a) => ({ ...a }));
  }

  async ergaenzeAblesung(eingabe: AblesungEingabe): Promise<Kilometerstand> {
    const ablesung: Kilometerstand = {
      id: naechsteId('ablesung'),
      fahrzeugId: eingabe.fahrzeugId,
      abgelesenAm: eingabe.abgelesenAm,
      stand: eingabe.stand,
      erfasstAm: new Date().toISOString(),
      erfasstVon: this.jetzigeIdentitaet(),
      quelle: eingabe.quelle,
      korrigiert: eingabe.korrigiert,
      bemerkung: eingabe.bemerkung,
    };
    const liste = this.ablesungen.get(eingabe.fahrzeugId) ?? [];
    liste.push(ablesung);
    this.ablesungen.set(eingabe.fahrzeugId, liste);
    return { ...ablesung };
  }

  /** Nur für Tests: Ablesungen direkt vorbelegen, ohne den Identitätsweg zu durchlaufen. */
  _vorbelegenAblesungen(fahrzeugId: string, ablesungen: Kilometerstand[]): void {
    this.ablesungen.set(fahrzeugId, [...ablesungen]);
  }
}
