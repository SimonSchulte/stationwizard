import { Herkunft, PruefFach } from './pruefvorlage.model';

/**
 * Fahrzeugcheck: die Bestandskontrolle eines Behälters gegen seine Prüfvorlage.
 *
 * Ein abgeschlossener Check ist eine unveränderliche Momentaufnahme. Jede
 * Position trägt deshalb Bezeichnung, Sollmenge, Einheit und Herkunft selbst –
 * eine spätere Änderung der Vorlage kann einen gespeicherten Check weder
 * verfälschen noch beschädigen.
 */

/** Woher ein Check stammt. `oeffentlich` entsteht nur intern bei einer Freigabe. */
export type Checkquelle = 'angemeldet' | 'oeffentlich';

/** Was der Client je Position sendet – bewusst wenig; das Soll kommt vom Worker. */
export interface CheckpositionEingabe {
  artikelId: string;
  geprueft: boolean;
  istMenge: number;
  unbrauchbar: boolean;
  /** Ein Eintrag je Stück laut Sollmenge; `null` heißt "nicht erfasst". */
  verfallsdaten: (string | null)[];
}

/** Eine gespeicherte Position: Eingabe plus Momentaufnahme aus der Vorlage. */
export interface Checkposition extends CheckpositionEingabe {
  fachId: string;
  fach: string;
  bezeichnung: string;
  sollMenge: number;
  einheit: string;
  herkunft: Herkunft;
  verfallsdatumPflicht: boolean;
}

/** Kopfdaten eines Checks; die Historie zeigt die Positionen nie. */
export interface CheckKopf {
  id: string;
  behaelterId: string;
  vorlageId: string;
  vorlageBezeichnung: string;
  geprueftAm: string;
  erfasstAm: string;
  erfasstVon: string;
  gemeldetVonName: string | null;
  quelle: Checkquelle;
  verfallsdatumErfasst: boolean;
  bemerkung: string;
  positionenGesamt: number;
  positionenGeprueft: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
}

export interface Fahrzeugcheck extends CheckKopf {
  grundlage: string;
  vorlageVersion: number;
  positionen: Checkposition[];
}

/** Alles, was die Prüfseite braucht – vom Worker in einem Aufruf geliefert. */
export interface Pruefauftrag {
  behaelter: {
    id: string;
    bezeichnung: string;
    bemerkung: string;
    fahrzeugBezeichnung: string;
    fahrzeugFunkrufname: string;
    fahrzeugGruppe: string;
  };
  vorlage: {
    id: string;
    bezeichnung: string;
    grundlage: string;
    version: number;
    faecher: PruefFach[];
  };
}

/** Der laufende Check im Speicher: je Artikel-Id der aktuelle Stand. */
export interface Checkstand {
  behaelterId: string;
  verfallsdatumErfasst: boolean;
  bemerkung: string;
  positionen: Record<string, CheckpositionEingabe>;
}
