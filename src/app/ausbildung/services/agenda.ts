import type { Kategorie } from '../models/plan.model';
import type { PlanSlot, WochenZeile } from './plan-raster';
import type { TagesInhalt, TagesKarte } from './tages-inhalt';

/** Welche Art von Eintrag die Agendaliste zeigt. */
export type TypFilter = 'alle' | 'dienst' | 'termin';

export interface AgendaFilter {
  /** Leer bedeutet: alle Kategorien. */
  readonly kategorien: ReadonlySet<Kategorie>;
  readonly typ: TypFilter;
  /** Nur Diensttage ohne Ausbildungsthema – tagesgenau, nicht wochenweise. */
  readonly nurLuecken?: boolean;
  /** Nur Tage, an denen ein HiOrg-Name vom Plan abweicht; `null`/fehlend: alle Tage. */
  readonly abweichungstage?: ReadonlySet<string> | null;
}

export const KEIN_AGENDAFILTER: AgendaFilter = { kategorien: new Set(), typ: 'alle' };

/** Ein Tag der Agendaliste: entweder mit Karten oder als Lücke am Diensttag. */
export interface AgendaTag {
  readonly slot: PlanSlot;
  /** Die Karten des Tages nach Filter und HiOrg-Ebene, ohne Deckelung. */
  readonly karten: readonly TagesKarte[];
  /** HiOrg-Karten hinter einer Sammelkarte dieses Tages, zum Aufklappen. */
  readonly eingesammelt: readonly TagesKarte[];
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
      // Die Sammelkarte steht für HiOrg-Einträge ohne Kategorie und ohne Terminart.
      return filter.kategorien.size === 0 && filter.typ === 'alle';
  }
}

/**
 * Stellt die Agendaliste zusammen: nur Tage im Jahr, die etwas zu zeigen haben.
 *
 * Leere Tage entfallen – das ist der Sinn der Liste gegenüber dem Raster. Eine
 * Lücke am Diensttag bleibt sichtbar, solange kein Kategoriefilter läuft (eine
 * Lücke hat keine Kategorie) und nicht nur Termine gefragt sind (eine Lücke ist
 * ein Dienst). Wochen ohne sichtbaren Tag entfallen. Die Filter „Nur Lücken“ und
 * „Nur Abweichungen“ wirken tagesgenau; die HiOrg-Ebene folgt `TagesInhalt.verdichtet`.
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
      if (filter.abweichungstage && !filter.abweichungstage.has(slot.datum)) {
        continue;
      }
      if (filter.nurLuecken && !slot.luecke) {
        continue;
      }
      const inhalt = inhalte.get(slot.datum);
      const karten = (inhalt?.verdichtet ?? []).filter((k) => passt(k, filter));
      const luecke = slot.luecke && lueckenSichtbar;
      // Eine Lücke mit leerem Platzhaltertermin zeigt dessen Karte nicht: die Zeile steht für sie.
      const sichtbar = luecke
        ? karten.filter((k) => k.art !== 'termin' || k.termin.termin.thema.trim())
        : karten;
      const eingesammelt = sichtbar.some((k) => k.art === 'sammel')
        ? (inhalt?.eingesammelt ?? [])
        : [];
      if (sichtbar.length > 0 || luecke) {
        tage.push({ slot, karten: sichtbar, eingesammelt, luecke });
      }
    }
    if (tage.length > 0) {
      ergebnis.push({ nummer: woche.nummer, start: woche.start, ende: woche.ende, tage });
    }
  }
  return ergebnis;
}
