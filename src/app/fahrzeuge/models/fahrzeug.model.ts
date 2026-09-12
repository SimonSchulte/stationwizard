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
  bemerkung: string;
  wartungstermine: Wartungstermin[];
  /** ISO-Zeitstempel der letzten Änderung. */
  geaendertAm: string;
  /** Geprüfte Access-E-Mail-Adresse der letzten Änderung. */
  geaendertVon: string;
}

export type KilometerQuelle = 'qr' | 'formular' | 'korrektur';

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
}

/** Eingabe für eine neue Ablesung; Server ergänzt `id`, `erfasstAm`, `erfasstVon`. */
export interface AblesungEingabe {
  fahrzeugId: string;
  abgelesenAm: string;
  stand: number;
  quelle: KilometerQuelle;
  korrigiert: string | null;
  bemerkung: string;
}
