import type { Kategorie } from '../models/plan.model';
import type { PlanSlot, WochenZeile } from './plan-raster';
import type { TagesInhalt, TagesKarte } from './tages-inhalt';

/** Welche Art von Eintrag die Agendaliste zeigt. */
export type TypFilter = 'alle' | 'dienst' | 'termin';

export interface AgendaFilter {
  /** Leer bedeutet: alle Kategorien. */
  readonly kategorien: ReadonlySet<Kategorie>;
  readonly typ: TypFilter;
}

export const KEIN_AGENDAFILTER: AgendaFilter = { kategorien: new Set(), typ: 'alle' };

/** Ein Tag der Agendaliste: entweder mit Karten oder als Lücke am Diensttag. */
export interface AgendaTag {
  readonly slot: PlanSlot;
  /** Die ungekürzten Karten des Tages, nach Filter. */
  readonly karten: readonly TagesKarte[];
  /** Diensttag ohne Ausbildungsthema – wird als Handlungsaufforderung gezeigt. */
  readonly luecke: boolean;
}

export interface AgendaWoche {
  readonly nummer: number;
  readonly start: string;
  readonly ende: string;
  readonly tage: readonly AgendaTag[];
}

function passt(karte: TagesKarte, filter: AgendaFilter): boolean {
  switch (karte.art) {
    case 'termin': {
      const termin = karte.termin.termin;
      if (filter.typ !== 'alle' && termin.typ !== filter.typ) {
        return false;
      }
      return (
        filter.kategorien.size === 0 ||
        (termin.kategorie !== '' && filter.kategorien.has(termin.kategorie))
      );
    }
    case 'hiorg':
      // HiOrg-Einträge tragen keine Kategorie: bei einem Kategoriefilter entfallen sie.
      return (
        filter.kategorien.size === 0 &&
        (filter.typ === 'alle' || karte.hiorg.eintrag.art === filter.typ)
      );
    case 'sammel':
      return false;
  }
}

/**
 * Stellt die Agendaliste zusammen: nur Tage im Jahr, die etwas zu zeigen haben.
 *
 * Leere Tage entfallen – das ist der Sinn der Liste gegenüber dem Raster. Eine
 * Lücke am Diensttag bleibt sichtbar, solange kein Kategoriefilter läuft (eine
 * Lücke hat keine Kategorie) und nicht nur Termine gefragt sind (eine Lücke ist
 * ein Dienst). Wochen ohne sichtbaren Tag entfallen.
 */
export function baueAgenda(
  wochen: readonly WochenZeile[],
  inhalte: ReadonlyMap<string, TagesInhalt>,
  filter: AgendaFilter = KEIN_AGENDAFILTER,
): AgendaWoche[] {
  const lueckenSichtbar = filter.kategorien.size === 0 && filter.typ !== 'termin';
  const ergebnis: AgendaWoche[] = [];
  for (const woche of wochen) {
    const tage: AgendaTag[] = [];
    for (const slot of woche.tage) {
      if (!slot.imJahr) {
        continue;
      }
      const karten = (inhalte.get(slot.datum)?.alle ?? []).filter((k) => passt(k, filter));
      const luecke = slot.luecke && lueckenSichtbar;
      // Eine Lücke mit leerem Platzhaltertermin zeigt dessen Karte nicht: die Zeile steht für sie.
      const sichtbar = luecke
        ? karten.filter((k) => k.art !== 'termin' || k.termin.termin.thema.trim())
        : karten;
      if (sichtbar.length > 0 || luecke) {
        tage.push({ slot, karten: sichtbar, luecke });
      }
    }
    if (tage.length > 0) {
      ergebnis.push({ nummer: woche.nummer, start: woche.start, ende: woche.ende, tage });
    }
  }
  return ergebnis;
}
