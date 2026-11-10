import { Aufbau, AufbauKennzahlen, AufbauVorlage, AufbauVorlageKopf } from '../models/aufbau.model';
import { AufbauStorage, AufbauVorlagenStorage } from '../storage/aufbau-storage';
import {
  EinsatzplanungBereitsVorhandenFehler,
  EinsatzplanungKonfliktFehler,
} from '../storage/einsatzplanung-fehler';
import { MitVersion } from '../storage/mit-version';
import { zaehleAufbauInhalt } from '../services/aufbau-bearbeiten';

interface Eintrag<T> {
  daten: T;
  version: number;
}
const etag = (version: number): string => `"${version}"`;
const istAktuell = (eintrag: Eintrag<unknown> | undefined, version: string): boolean =>
  !!eintrag && etag(eintrag.version) === version;

export class InMemoryAufbauStorage implements AufbauStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';
  private readonly eintraege = new Map<string, Eintrag<Aufbau>>();

  async ladeAufbau(einsatzId: string): Promise<MitVersion<Aufbau> | null> {
    const eintrag = this.eintraege.get(einsatzId);
    return eintrag
      ? { daten: structuredClone(eintrag.daten), version: etag(eintrag.version) }
      : null;
  }

  async legeAufbauAn(einsatzId: string, aufbau: Aufbau): Promise<string> {
    if (this.eintraege.has(einsatzId)) throw new EinsatzplanungBereitsVorhandenFehler(null);
    this.eintraege.set(einsatzId, { daten: structuredClone(aufbau), version: 1 });
    return etag(1);
  }

  async speichereAufbau(einsatzId: string, aufbau: Aufbau, version: string): Promise<string> {
    const eintrag = this.eintraege.get(einsatzId);
    if (!eintrag || !istAktuell(eintrag, version)) {
      throw new EinsatzplanungKonfliktFehler('Der Aufbau');
    }
    eintrag.daten = structuredClone(aufbau);
    eintrag.version += 1;
    return etag(eintrag.version);
  }

  async loescheAufbau(einsatzId: string, version: string): Promise<void> {
    if (!istAktuell(this.eintraege.get(einsatzId), version)) {
      throw new EinsatzplanungKonfliktFehler('Der Aufbau');
    }
    this.eintraege.delete(einsatzId);
  }

  /** Nur für Tests und `InMemoryEinsatzStorage`. */
  kennzahlen(einsatzId: string): AufbauKennzahlen | null {
    const eintrag = this.eintraege.get(einsatzId);
    return eintrag ? zaehleAufbauInhalt(eintrag.daten.inhalt) : null;
  }

  /** Nur für Tests: direkt vorbelegen. */
  _vorbelegen(einsatzId: string, aufbau: Aufbau): string {
    this.eintraege.set(einsatzId, { daten: structuredClone(aufbau), version: 1 });
    return etag(1);
  }
}

export class InMemoryAufbauVorlagenStorage implements AufbauVorlagenStorage {
  readonly bezeichnung = 'In-Memory (nur für Tests)';
  private readonly eintraege = new Map<string, Eintrag<AufbauVorlage>>();

  async ladeVorlagen(): Promise<AufbauVorlageKopf[]> {
    return [...this.eintraege.values()].map((e) => ({
      id: e.daten.id,
      titel: e.daten.titel,
      version: e.version,
      ...zaehleAufbauInhalt(e.daten.inhalt),
      geaendertAm: '2026-11-10T08:00:00.000Z',
    }));
  }

  async ladeVorlage(id: string): Promise<MitVersion<AufbauVorlage> | null> {
    const eintrag = this.eintraege.get(id);
    return eintrag
      ? { daten: structuredClone(eintrag.daten), version: etag(eintrag.version) }
      : null;
  }

  async legeVorlageAn(vorlage: AufbauVorlage): Promise<string> {
    if (this.eintraege.has(vorlage.id)) throw new EinsatzplanungBereitsVorhandenFehler(null);
    this.eintraege.set(vorlage.id, { daten: structuredClone(vorlage), version: 1 });
    return etag(1);
  }

  async speichereVorlage(vorlage: AufbauVorlage, version: string): Promise<string> {
    const eintrag = this.eintraege.get(vorlage.id);
    if (!eintrag || !istAktuell(eintrag, version)) {
      throw new EinsatzplanungKonfliktFehler('Die Vorlage');
    }
    eintrag.daten = structuredClone(vorlage);
    eintrag.version += 1;
    return etag(eintrag.version);
  }

  async loescheVorlage(id: string, version: string): Promise<void> {
    if (!istAktuell(this.eintraege.get(id), version)) {
      throw new EinsatzplanungKonfliktFehler('Die Vorlage');
    }
    this.eintraege.delete(id);
  }

  _vorbelegen(vorlage: AufbauVorlage): string {
    this.eintraege.set(vorlage.id, { daten: structuredClone(vorlage), version: 1 });
    return etag(1);
  }
}
