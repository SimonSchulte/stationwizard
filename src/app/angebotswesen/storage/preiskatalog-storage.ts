import { PreiskatalogArt, PreiskatalogEintrag } from '../models/preiskatalog.model';

/**
 * Gemeinsamer Vertrag für die Persistenz des Preiskatalogs. Die Fachschicht
 * kennt nur dieses Interface, analog zu `fahrzeuge/storage/fahrzeug-storage.ts`.
 */
export interface PreiskatalogEintragEingabe {
  id: string;
  bezeichnung: string;
  art: PreiskatalogArt;
  einzelpreisCent: number;
}

export interface PreiskatalogStorage {
  readonly bezeichnung: string;

  ladeEintraege(): Promise<PreiskatalogEintrag[]>;

  /**
   * Legt an oder aktualisiert. `version` ist die zuletzt bekannte Version
   * dieser Zeile aus der Liste – `null` bedeutet Neuanlage. Bei einem
   * Versionskonflikt wirft der Adapter `PreiskatalogKonfliktFehler`.
   */
  speichereEintrag(
    eintrag: PreiskatalogEintragEingabe,
    version: number | null,
  ): Promise<PreiskatalogEintrag>;

  loescheEintrag(id: string): Promise<void>;
}

/** Wird geworfen, wenn `version` beim Speichern nicht mehr aktuell ist. */
export class PreiskatalogKonfliktFehler extends Error {
  constructor(readonly eintragId: string) {
    super('Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden und zusammenführen.');
    this.name = 'PreiskatalogKonfliktFehler';
  }
}
