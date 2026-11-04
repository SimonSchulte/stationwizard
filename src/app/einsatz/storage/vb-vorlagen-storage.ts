import { VbVorlage, VbVorlageKopf } from '../models/vb.model';
import { MitVersion } from './mit-version';

/** Persistenz der VB-Vorlagen (`/api/einsatzplanung/vb-vorlagen`). */
export interface VbVorlagenStorage {
  readonly bezeichnung: string;

  /** Kopfdaten mit Kennzahlen, ohne Inhalt; kurz gepuffert. */
  ladeVorlagen(): Promise<VbVorlageKopf[]>;
  /** Vollständige Vorlage samt Version; `null`, wenn unbekannt. Ungepuffert. */
  ladeVorlage(id: string): Promise<MitVersion<VbVorlage> | null>;
  /** @returns die Version der neuen Vorlage. */
  legeVorlageAn(vorlage: VbVorlage): Promise<string>;
  /** Wirft bei veralteter Version `EinsatzplanungKonfliktFehler`. @returns die neue Version. */
  speichereVorlage(vorlage: VbVorlage, version: string): Promise<string>;
  loescheVorlage(id: string, version: string): Promise<void>;
}
