/**
 * Prüfvorlage: die Soll-Liste eines Behältertyps, gegliedert in Fächer und
 * Artikel. Reine Domäne – kein HTTP, kein ETag, keine Datenbankform.
 *
 * Die Vorlage ist bewusst frei pflegbar und kein fester Vertrag im Sinne von
 * `TAKTISCH_ORDER`: welche Artikel ein Notfallrucksack führt, ändert sich mit
 * der Ausstattungsvorgabe und gehört nicht in den Quellcode.
 */

/**
 * Woher ein Artikel bezogen wird. `beide` heißt: in der SEG-Liste und in der
 * Landesliste enthalten. Für die Bestellung gilt dann Land, weil ein Artikel
 * mit Landbezug immer über Land läuft (siehe `istLandBeziehbar`).
 */
export type Herkunft = 'seg' | 'land' | 'beide';

export const HERKUENFTE: readonly Herkunft[] = ['seg', 'land', 'beide'];

export const HERKUNFT_LABEL: Readonly<Record<Herkunft, string>> = {
  seg: 'SEG',
  land: 'Land',
  beide: 'SEG+Land',
};

export interface PruefArtikel {
  id: string;
  bezeichnung: string;
  /** Wie viele Stück der Behälter führen soll; mindestens eins. */
  sollMenge: number;
  /** Leer heißt "Stück"; sonst etwa `Paar` oder `Packung`. */
  einheit: string;
  herkunft: Herkunft;
  /**
   * Ob beim Check je Stück ein Verfallsdatum erfasst wird. Bewusst am Artikel
   * und nicht global: für Schere, Laryngoskop und Protokollblätter wäre ein
   * Datumsfeld nur Tipparbeit.
   */
  verfallsdatumPflicht: boolean;
}

export interface PruefFach {
  id: string;
  bezeichnung: string;
  artikel: PruefArtikel[];
}

export interface Pruefvorlage {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  /** Fußzeile der erzeugten Berichte; benennt die fachliche Grundlage. */
  grundlage: string;
  faecher: PruefFach[];
  geaendertAm: string;
  geaendertVon: string;
}

/** Kopfdaten für die Übersicht; der Baum wird dort nie gebraucht. */
export interface PruefvorlageKopf {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  grundlage: string;
  anzahlFaecher: number;
  anzahlArtikel: number;
  geaendertAm: string;
  geaendertVon: string;
}

/**
 * Ein Artikel mit Landbezug wird immer über Land bezogen und gemeldet; nur
 * reine SEG-Artikel ohne Land-Pendant laufen über die SEG.
 */
export function istLandBeziehbar(herkunft: Herkunft): boolean {
  return herkunft === 'land' || herkunft === 'beide';
}

export function anzahlArtikel(faecher: readonly PruefFach[]): number {
  return faecher.reduce((summe, fach) => summe + fach.artikel.length, 0);
}
