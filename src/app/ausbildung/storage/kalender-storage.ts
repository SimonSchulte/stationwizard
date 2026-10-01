import { Arbeitsmappe, Jahresblatt } from '../models/plan.model';

/**
 * Vertrag der Kalender-Datenhaltung. Die Fachschicht (`KalenderDatenService`)
 * sieht nur diese Schnittstelle; `ApiKalenderStorage` übersetzt gegen
 * `/api/kalender`. `version` ist das undurchsichtige ETag (`"3"`) für ein
 * späteres `If-Match`; `null` bedeutet „noch nie gespeichert“ und führt zu einer
 * Neuanlage mit `If-None-Match: *`.
 */
export interface GespeichertesJahr {
  blatt: Jahresblatt;
  version: string;
}

export interface KalenderStand {
  jahre: GespeichertesJahr[];
}

export interface KalenderStorage {
  laden(): Promise<KalenderStand>;
  /** Legt ein Jahr an (`version === null`) oder aktualisiert es; liefert die neue Version. */
  speichereJahr(blatt: Jahresblatt, version: string | null): Promise<string>;
  /** Einmalige Übernahme einer Excel-Arbeitsmappe in den leeren Kalender. */
  migriere(arbeitsmappe: Arbeitsmappe): Promise<KalenderStand>;
}

/** HTTP 412: jemand anderes hat zwischenzeitlich gespeichert. */
export class KalenderKonfliktFehler extends Error {
  constructor(readonly teil: string) {
    super(
      `${teil} wurde zwischenzeitlich geändert. Deine Änderungen bleiben erhalten – ` +
        'sichere sie als Excel-Kopie und lade danach den gespeicherten Stand.',
    );
    this.name = 'KalenderKonfliktFehler';
  }
}

/** HTTP 409 bei der Migration: der Kalender enthält bereits Daten. */
export class KalenderBereitsBefuelltFehler extends Error {
  constructor() {
    super('Der Kalender enthält bereits Daten; die Excel-Übernahme ist nur einmal möglich.');
    this.name = 'KalenderBereitsBefuelltFehler';
  }
}
