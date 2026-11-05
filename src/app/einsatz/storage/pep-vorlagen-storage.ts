import { PepVorlage, PepVorlageKopf } from '../models/pep.model';
import { MitVersion } from './mit-version';

/** Persistenz der PEP-Vorlagen (`/api/einsatzplanung/pep-vorlagen`). */
export interface PepVorlagenStorage {
  readonly bezeichnung: string;

  /** Kopfdaten mit Kennzahlen, ohne Inhalt; kurz gepuffert. */
  ladeVorlagen(): Promise<PepVorlageKopf[]>;
  /** Vollständige Vorlage samt Version; `null`, wenn unbekannt. Ungepuffert. */
  ladeVorlage(id: string): Promise<MitVersion<PepVorlage> | null>;
  /** @returns die Version der neuen Vorlage. */
  legeVorlageAn(vorlage: PepVorlage): Promise<string>;
  /** Wirft bei veralteter Version `EinsatzplanungKonfliktFehler`. @returns die neue Version. */
  speichereVorlage(vorlage: PepVorlage, version: string): Promise<string>;
  loescheVorlage(id: string, version: string): Promise<void>;
}
