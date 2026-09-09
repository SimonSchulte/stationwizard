/**
 * Ein Termin aus dem HiOrg-Kalenderfeed. Bewusst **kein** Teil des
 * `PlanDocument`: der Feed ist eine reine Anzeige- und Abgleichquelle, die
 * Excel-Arbeitsmappe bleibt das führende Ausbildungsformat.
 */
export type HiorgArt = 'termin' | 'dienst';

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
  /** Angezeigte Bezeichnung, entitätenfrei und getrimmt. */
  readonly name: string;
  readonly art: HiorgArt;
  /** Bereits im Worker geprüfter HiOrg-Link, sonst `null`. */
  readonly url: string | null;
}

export function istMehrtaegig(eintrag: HiorgEintrag): boolean {
  return eintrag.ende > eintrag.beginn;
}

export function artName(art: HiorgArt): string {
  return art === 'dienst' ? 'Dienst' : 'Termin';
}
