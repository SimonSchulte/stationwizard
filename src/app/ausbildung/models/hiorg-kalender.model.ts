/**
 * Ein Termin aus dem HiOrg-Kalenderfeed. Bewusst **kein** Teil des
 * `PlanDocument`: der Feed ist eine reine Anzeige- und Abgleichquelle, die
 * Excel-Arbeitsmappe bleibt das führende Ausbildungsformat.
 */

import { type TerminTyp, typName } from './plan.model';

/**
 * Der Feed nennt das Feld `typ`; im Plan heißt dieselbe Unterscheidung
 * `TerminTyp`. Ein Alias statt eines zweiten Wertebereichs, damit übernommene
 * Einträge ihre Einordnung ohne Umrechnung behalten.
 */
export type HiorgArt = TerminTyp;

export interface HiorgEintrag {
  /**
   * Stabiler Schlüssel für `track` und Nachschlagen. Die `id` des Feeds ist
   * **nicht** eindeutig: Serientermine wiederholen dieselbe `id` und
   * unterscheiden sich nur im Zeitraum und im `zid`-Teil ihrer URL.
   */
  readonly schluessel: string;
  /** Erster Kalendertag in Europe/Berlin, ISO. */
  readonly beginn: string;
  /** Letzter Kalendertag einschließlich; gleich `beginn` bei eintägigen Terminen. */
  readonly ende: string;
  /** Ortszeit `HH:MM` des Beginns, leer wenn der Feed keine brauchbare Zeit nennt. */
  readonly beginnZeit: string;
  readonly endeZeit: string;
  /** Angezeigte Bezeichnung, entitätenfrei und getrimmt. */
  readonly name: string;
  readonly art: HiorgArt;
  /** Bereits im Worker geprüfter HiOrg-Link, sonst `null`. */
  readonly url: string | null;
  /** `id` des Feeds, nicht eindeutig – siehe `schluessel`. Grundlage für `hiorgServerLink()`. */
  readonly id: string;
}

export function istMehrtaegig(eintrag: HiorgEintrag): boolean {
  return eintrag.ende > eintrag.beginn;
}

export function artName(art: HiorgArt): string {
  return typName(art);
}

/**
 * Direktlink auf die Detailseite dieses Eintrags im HiOrg-Server – anders als
 * `url` (Feed-Feld, kann fehlen oder auf ein Formular statt die Detailseite
 * zeigen) fest aus `art` und `id` gebaut. `ov=biel` ist bei beiden Formularen
 * Pflichtparameter des HiOrg-Servers.
 */
export function hiorgServerLink(eintrag: HiorgEintrag): string {
  return eintrag.art === 'termin'
    ? `https://www.hiorg-server.de/termin.php?ov=biel&id=${eintrag.id}`
    : `https://www.hiorg-server.de/dienstform.php?action=show_existing&ov=biel&id=${eintrag.id}`;
}
