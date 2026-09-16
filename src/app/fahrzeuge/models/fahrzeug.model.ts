/**
 * Domänenmodell des Fahrzeugmoduls. Kennt ausschließlich eigene Typen – kein
 * Datenbank-, ETag- oder HTTP-Bezug, damit die Fachschicht unabhängig vom
 * gewählten Persistenzadapter bleibt (siehe docs/konzept-fahrzeuge.md).
 */

export type Eigentuemer = 'land-nrw' | 'bund' | 'organisation';

export const EIGENTUEMER: readonly Eigentuemer[] = ['land-nrw', 'bund', 'organisation'];

/** Mindestlaufleistung je Monat; `organisation` hat keine Vorgabe. */
export const MINDEST_KM_PRO_MONAT: Readonly<Record<Eigentuemer, number>> = {
  'land-nrw': 150,
  bund: 50,
  organisation: 0,
};

/**
 * Gruppenzugehörigkeit eines Fahrzeugs, entsprechend den bekannten
 * Gruppenführungen (siehe `benutzerverwaltung/models/benutzerkonto.model.ts`,
 * `Hauptrolle`) – ohne `verpflegung`, da dafür fachlich keine Fahrzeuge
 * vorgesehen sind.
 */
export type Gruppe = 'betreuung' | 'tesi' | 'fuehrung' | 'sanitaet';

export const GRUPPEN: readonly Gruppe[] = ['betreuung', 'tesi', 'fuehrung', 'sanitaet'];

export const GRUPPE_STANDARD: Gruppe = 'fuehrung';

export type WartungsArt = 'hu' | 'frei';

export interface Wartungstermin {
  id: string;
  art: WartungsArt;
  /** Bei `art === 'hu'` fest "Hauptuntersuchung"; sonst frei benennbar. */
  bezeichnung: string;
  /** ISO-Kalendertag (`YYYY-MM-DD`), an dem der Termin fällig wird. */
  faelligAm: string;
  /** Vorlauf in Tagen, ab dem das Dashboard warnt. Je Termin einstellbar. */
  erinnerungTage: number;
  /** ISO-Kalendertag der Erledigung, oder `null` solange offen. */
  erledigtAm: string | null;
}

export interface Fahrzeugstamm {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  /** Fahrgestellnummer (FIN), optional, 17 Zeichen ohne I/O/Q wenn gesetzt. */
  fahrgestellnummer: string | null;
  eigentuemer: Eigentuemer;
  gruppe: Gruppe;
  bemerkung: string;
  wartungstermine: Wartungstermin[];
  /** ISO-Zeitstempel der letzten Änderung. */
  geaendertAm: string;
  /** Geprüfte Access-E-Mail-Adresse der letzten Änderung. */
  geaendertVon: string;
}

/**
 * Erfassungsweg einer Ablesung.
 *
 * `oeffentlich` entsteht ausschließlich serverseitig bei der Freigabe einer
 * öffentlichen Kilometermeldung und ist deshalb kein einreichbarer Wert –
 * `AblesungEingabe.quelle` lässt ihn bewusst nicht zu, und der Worker weist ihn
 * ab (siehe `KILOMETER_QUELLEN_EINGABE` in `worker/src/fahrzeuge.ts`).
 */
export type KilometerQuelle = 'qr' | 'formular' | 'korrektur' | 'oeffentlich';

/** Die Quellen, die ein Client selbst angeben darf. */
export type EingebbareQuelle = Exclude<KilometerQuelle, 'oeffentlich'>;

export interface Kilometerstand {
  id: string;
  fahrzeugId: string;
  /** ISO-Kalendertag, vom Erfasser gewählt. */
  abgelesenAm: string;
  /** Ganzzahliger Kilometerstand. */
  stand: number;
  /** ISO-Zeitstempel, serverseitig gesetzt. */
  erfasstAm: string;
  /** Geprüfte Access-E-Mail-Adresse, serverseitig gesetzt – nie aus dem Anfragekörper. */
  erfasstVon: string;
  quelle: KilometerQuelle;
  /** Id der Ablesung, die durch diese ersetzt wird, oder `null`. */
  korrigiert: string | null;
  bemerkung: string;
  /**
   * Bei `quelle === 'oeffentlich'` der selbst angegebene Name des Meldenden,
   * sonst leer. Bewusst neben `erfasstVon` statt darin: das ist eine ungeprüfte
   * Selbstauskunft, `erfasstVon` bleibt immer eine geprüfte Identität – nach
   * einer Freigabe die der freigebenden Person.
   */
  gemeldetVonName: string;
}

/** Eingabe für eine neue Ablesung; Server ergänzt `id`, `erfasstAm`, `erfasstVon`. */
export interface AblesungEingabe {
  fahrzeugId: string;
  abgelesenAm: string;
  stand: number;
  /** `oeffentlich` fehlt hier absichtlich; der Wert entsteht nur bei der Freigabe. */
  quelle: EingebbareQuelle;
  korrigiert: string | null;
  bemerkung: string;
}

/**
 * Eine über den öffentlichen QR-Code eingegangene Kilometermeldung, die noch
 * auf die Freigabe durch die Zug- oder Gruppenführung wartet. Sie ist **kein**
 * Kilometerstand: erst die Freigabe erzeugt daraus eine `Kilometerstand`-Zeile.
 */
export interface Ablesungseinreichung {
  id: string;
  fahrzeugId: string;
  bezeichnung: string;
  kennzeichen: string;
  gruppe: Gruppe;
  abgelesenAm: string;
  stand: number;
  eingereichtAm: string;
  /** Selbst angegeben, ungeprüft. */
  gemeldetVonName: string;
  bemerkung: string;
  /** Letzter gültiger Stand des Fahrzeugs, oder `null` ohne jede Ablesung. */
  letzterStand: number | null;
  letzterStandAm: string | null;
}

/**
 * Ein Eintrag im Änderungsprotokoll eines Fahrzeugs. Ausschließlich
 * serverseitig erzeugt: `zeitpunkt`, `von` und `beschreibung` stammen aus der
 * geprüften Anmeldung bzw. dem tatsächlichen Unterschied zwischen altem und
 * neuem Stand, nie aus einer Client-Eingabe – es gibt keinen Endpunkt, über
 * den ein Client einen Eintrag selbst schreiben könnte.
 */
export interface Aenderungseintrag {
  id: string;
  fahrzeugId: string;
  /** ISO-Zeitstempel, serverseitig gesetzt. */
  zeitpunkt: string;
  /** Geprüfte Access-E-Mail-Adresse, serverseitig gesetzt. */
  von: string;
  /**
   * Menschenlesbare Beschreibung; kann mehrere mit `\n` getrennte Zeilen
   * enthalten, wenn eine einzelne Änderung mehrere Felder betraf.
   */
  beschreibung: string;
}
