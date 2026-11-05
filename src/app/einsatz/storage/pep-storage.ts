import { Pep } from '../models/pep.model';
import { MitVersion } from './mit-version';

/** Persistenz der PEP eines Einsatzes (`…/einsaetze/<UUID>/pep`). */
export interface PepStorage {
  readonly bezeichnung: string;

  /** `null`, wenn der Einsatz (noch) keine PEP hat. Ungepuffert. */
  ladePep(einsatzId: string): Promise<MitVersion<Pep> | null>;
  /** Anlage mit `If-None-Match: *`; 409, wenn es schon eine gibt. @returns die Version. */
  legePepAn(einsatzId: string, pep: Pep): Promise<string>;
  /** Wirft bei veralteter Version `EinsatzplanungKonfliktFehler`. @returns die neue Version. */
  speicherePep(einsatzId: string, pep: Pep, version: string): Promise<string>;
  loeschePep(einsatzId: string, version: string): Promise<void>;
}
