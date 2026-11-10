import { Aufbau, AufbauVorlage, AufbauVorlageKopf } from '../models/aufbau.model';
import { MitVersion } from './mit-version';

/** Persistenz des Aufbaus eines Einsatzes (`…/einsaetze/<UUID>/aufbau`). */
export interface AufbauStorage {
  readonly bezeichnung: string;

  /** `null`, wenn der Einsatz (noch) keinen Aufbau hat. Ungepuffert. */
  ladeAufbau(einsatzId: string): Promise<MitVersion<Aufbau> | null>;
  /** Anlage mit `If-None-Match: *`; 409, wenn es schon einen gibt. @returns die Version. */
  legeAufbauAn(einsatzId: string, aufbau: Aufbau): Promise<string>;
  /** Wirft bei veralteter Version `EinsatzplanungKonfliktFehler`. @returns die neue Version. */
  speichereAufbau(einsatzId: string, aufbau: Aufbau, version: string): Promise<string>;
  loescheAufbau(einsatzId: string, version: string): Promise<void>;
}

/** Persistenz der Aufbau-Vorlagen (`/api/einsatzplanung/aufbau-vorlagen`). */
export interface AufbauVorlagenStorage {
  readonly bezeichnung: string;

  /** Kopfdaten mit Kennzahlen, ohne Inhalt; kurz gepuffert. */
  ladeVorlagen(): Promise<AufbauVorlageKopf[]>;
  /** Vollständige Vorlage samt Version; `null`, wenn unbekannt. Ungepuffert. */
  ladeVorlage(id: string): Promise<MitVersion<AufbauVorlage> | null>;
  legeVorlageAn(vorlage: AufbauVorlage): Promise<string>;
  speichereVorlage(vorlage: AufbauVorlage, version: string): Promise<string>;
  loescheVorlage(id: string, version: string): Promise<void>;
}
