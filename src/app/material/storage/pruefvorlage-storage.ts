import { Pruefvorlage, PruefvorlageKopf } from '../models/pruefvorlage.model';

/**
 * Gemeinsamer Vertrag für die Persistenz der Prüfvorlagen. Die Fachschicht
 * kennt nur dieses Interface; `version` ist für sie eine undurchsichtige
 * Zeichenkette. Analog zu `fahrzeuge/storage/fahrzeug-storage.ts`.
 */
export interface PruefvorlageMitVersion {
  daten: Pruefvorlage;
  version: string;
}

export interface PruefvorlageStorage {
  readonly bezeichnung: string;

  /** Nur Kopfdaten: der Baum einer Vorlage ist gut 20 kB und in der Liste nie sichtbar. */
  ladeKoepfe(): Promise<PruefvorlageKopf[]>;

  ladeVorlage(id: string): Promise<PruefvorlageMitVersion | null>;

  /**
   * Legt an oder aktualisiert. `version === null` bedeutet Neuanlage; sonst ist
   * es die zuletzt geladene Version für die optimistische Sperre. Liefert die
   * neue Version zurück.
   */
  speichereVorlage(vorlage: Pruefvorlage, version: string | null): Promise<string>;

  loescheVorlage(id: string): Promise<void>;
}

/** Wird geworfen, wenn die mitgesendete Version nicht mehr aktuell ist. */
export class VorlageKonfliktFehler extends Error {
  constructor(readonly vorlageId: string) {
    super('Die Prüfvorlage wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.');
    this.name = 'VorlageKonfliktFehler';
  }
}

/**
 * Wird beim Löschen geworfen, solange ein Behälter die Vorlage verwendet.
 * Getrennt vom Konfliktfehler, weil erneutes Laden hier nicht hilft.
 */
export class VorlageInBenutzungFehler extends Error {
  constructor(readonly vorlageId: string) {
    super('Die Prüfvorlage wird noch von mindestens einem Behälter verwendet.');
    this.name = 'VorlageInBenutzungFehler';
  }
}
