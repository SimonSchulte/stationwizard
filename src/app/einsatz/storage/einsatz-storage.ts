import { Einsatz, EinsatzListenEintrag } from '../models/einsatz.model';
import { MitVersion } from './mit-version';

/** Persistenz der Einsätze (`/api/einsatzplanung/einsaetze`). */
export interface EinsatzStorage {
  readonly bezeichnung: string;

  /** Alle Einsätze samt Kennzahlen von PEP und Aufbau; kurz gepuffert, ohne Version für Schreibzugriffe. */
  ladeEinsaetze(): Promise<EinsatzListenEintrag[]>;
  /** `null`, wenn es den Einsatz nicht gibt. Ungepuffert. */
  ladeEinsatz(id: string): Promise<MitVersion<Einsatz> | null>;
  /**
   * Legt neu an (`If-None-Match: *`). Wirft `EinsatzplanungBereitsVorhandenFehler` (409),
   * etwa wenn die HiOrg-Veranstaltung schon einen Einsatz hat.
   *
   * @returns die Version des neuen Stands.
   */
  legeEinsatzAn(einsatz: Einsatz): Promise<string>;
  /** Wirft bei veralteter Version `EinsatzplanungKonfliktFehler`. @returns die neue Version. */
  speichereEinsatz(einsatz: Einsatz, version: string): Promise<string>;
}
