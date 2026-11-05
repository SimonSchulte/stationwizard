import { Vorbereitung } from '../models/vb.model';
import { MitVersion } from './mit-version';

/** Persistenz der Vorbereitung eines Einsatzes (`…/einsaetze/<UUID>/vb`). */
export interface VorbereitungStorage {
  readonly bezeichnung: string;

  /** `null`, wenn der Einsatz (noch) keine Vorbereitung hat. Ungepuffert. */
  ladeVorbereitung(einsatzId: string): Promise<MitVersion<Vorbereitung> | null>;
  /** Anlage mit `If-None-Match: *`; 409, wenn es schon eine gibt. @returns die Version. */
  legeVorbereitungAn(einsatzId: string, vorbereitung: Vorbereitung): Promise<string>;
  /** Wirft bei veralteter Version `EinsatzplanungKonfliktFehler`. @returns die neue Version. */
  speichereVorbereitung(
    einsatzId: string,
    vorbereitung: Vorbereitung,
    version: string,
  ): Promise<string>;
  loescheVorbereitung(einsatzId: string, version: string): Promise<void>;
}
