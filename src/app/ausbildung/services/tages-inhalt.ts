import type { HiorgEintrag } from '../models/hiorg-kalender.model';
import type { HiorgAbweichung } from './hiorg-abgleich';
import type { SlotTermin } from './plan-raster';

/**
 * Wie die HiOrg-Ebene im Wochenraster erscheint.
 *
 * Die Excel-Mappe ist die führende Ausbildungsquelle, der Kalenderfeed nur
 * Anzeige- und Abgleichquelle. Ein Tag mit vielen Diensten darf den eigenen Plan
 * darum nicht verdrängen: `gesammelt` fasst die unauffälligen Einträge zu einer
 * Karte zusammen, `aus` blendet die Ebene ganz aus. Einträge mit Namensabweichung
 * bleiben in jedem Fall einzeln sichtbar – sie sind die Handlungsaufforderung.
 */
export type HiorgEbene = 'einzeln' | 'gesammelt' | 'aus';

/** Höchstzahl an Karten, die eine Tageszelle des Rasters selbst zeigt. */
export const MAX_KARTEN_PRO_TAG = 3;

/** Ein HiOrg-Eintrag samt seiner Bewertung gegen den Plan desselben Tages. */
export interface HiorgTagesKarte {
  readonly eintrag: HiorgEintrag;
  readonly abweichungen: readonly HiorgAbweichung[];
  readonly ohneGegenstueck: boolean;
}

export interface TagesKarteTermin {
  readonly art: 'termin';
  readonly schluessel: string;
  readonly termin: SlotTermin;
}

export interface TagesKarteHiorg {
  readonly art: 'hiorg';
  readonly schluessel: string;
  readonly hiorg: HiorgTagesKarte;
}

/** Platzhalter für mehrere unauffällige HiOrg-Einträge desselben Tages. */
export interface TagesKarteSammel {
  readonly art: 'sammel';
  readonly schluessel: string;
  readonly anzahl: number;
}

export type TagesKarte = TagesKarteTermin | TagesKarteHiorg | TagesKarteSammel;

export interface TagesInhalt {
  /** Karten, die die Tageszelle selbst zeigt – höchstens `maxKarten`. */
  readonly sichtbar: readonly TagesKarte[];
  /** Wie viele Karten dahinter stecken; `0`, wenn nichts gekürzt wurde. */
  readonly verborgen: number;
  /**
   * Der vollständige Tag für das Tagesdetail: alle Plantermine und alle
   * HiOrg-Einträge einzeln, unabhängig von Ebene und Deckelung. Wer das Detail
   * öffnet, will den ganzen Tag sehen und nicht dieselbe Kürzung noch einmal.
   */
  readonly alle: readonly TagesKarte[];
}

/** Ein Tag ohne jeden Eintrag – geteilte Instanz, damit Vergleiche stabil bleiben. */
export const LEERER_TAGESINHALT: TagesInhalt = { sichtbar: [], verborgen: 0, alle: [] };

/**
 * Stellt die Karten einer Tageszelle zusammen.
 *
 * Zwei Schritte: erst verdichtet die HiOrg-Ebene je nach Einstellung, dann
 * deckelt die Zelle auf `maxKarten`. Ohne diese Deckelung bestimmt der vollste
 * Tag die Höhe der ganzen Wochenzeile – ein Tag mit fünf Diensten bläht dann
 * sechs leere Nachbartage mit auf.
 */
export function baueTagesInhalt(
  termine: readonly SlotTermin[],
  hiorg: readonly HiorgTagesKarte[],
  ebene: HiorgEbene,
  maxKarten: number = MAX_KARTEN_PRO_TAG,
): TagesInhalt {
  if (termine.length === 0 && hiorg.length === 0) {
    return LEERER_TAGESINHALT;
  }

  const terminKarten: TagesKarte[] = termine.map((termin) => ({
    art: 'termin',
    schluessel: termin.termin.id,
    termin,
  }));
  const hiorgEinzeln: TagesKarte[] = hiorg.map((eintrag) => ({
    art: 'hiorg',
    schluessel: eintrag.eintrag.schluessel,
    hiorg: eintrag,
  }));

  const kandidaten = [...terminKarten, ...verdichteHiorg(hiorg, hiorgEinzeln, ebene)];
  const alle = [...terminKarten, ...hiorgEinzeln];

  if (kandidaten.length <= maxKarten) {
    return { sichtbar: kandidaten, verborgen: 0, alle };
  }

  // Eine Karte weniger, damit „+N weitere" selbst noch in die Zelle passt.
  const platz = Math.max(1, maxKarten - 1);
  const behalten = new Set(
    [...kandidaten]
      .map((karte, index) => ({ karte, index }))
      .sort((a, b) => rang(a.karte) - rang(b.karte) || a.index - b.index)
      .slice(0, platz)
      .map((eintrag) => eintrag.index),
  );

  return {
    // Die sichtbaren Karten behalten die Reihenfolge des Tages; nur die Auswahl
    // richtet sich nach dem Rang, nicht die Anzeige.
    sichtbar: kandidaten.filter((_, index) => behalten.has(index)),
    verborgen: kandidaten.length - behalten.size,
    alle,
  };
}

/**
 * Fasst die unauffälligen HiOrg-Einträge eines Tages zusammen. Eine Sammelkarte
 * lohnt erst ab zwei Einträgen – für einen einzelnen wäre sie nur ein Umweg.
 */
function verdichteHiorg(
  hiorg: readonly HiorgTagesKarte[],
  einzeln: readonly TagesKarte[],
  ebene: HiorgEbene,
): TagesKarte[] {
  if (ebene === 'aus') {
    return [];
  }
  if (ebene === 'einzeln') {
    return [...einzeln];
  }

  const auffaellig = einzeln.filter((_, index) => istAuffaellig(hiorg[index]));
  const ruhig = einzeln.filter((_, index) => !istAuffaellig(hiorg[index]));
  if (ruhig.length < 2) {
    return [...einzeln];
  }
  return [
    ...auffaellig,
    { art: 'sammel', schluessel: 'hiorg-sammel', anzahl: ruhig.length } satisfies TagesKarteSammel,
  ];
}

/** Ein Eintrag, dessen Name vom Plan abweicht, wird nie eingesammelt. */
function istAuffaellig(karte: HiorgTagesKarte): boolean {
  return karte.abweichungen.length > 0;
}

/**
 * Reihenfolge beim Kürzen: Zuerst fällt weg, was am ehesten verzichtbar ist.
 * Mehrtägige Plantermine stehen vorn – fehlte ein Segment, risse der Balken
 * mitten in der Woche ab.
 */
function rang(karte: TagesKarte): number {
  switch (karte.art) {
    case 'termin':
      return karte.termin.segment === 'einzeln' ? 1 : 0;
    case 'hiorg':
      return karte.hiorg.abweichungen.length > 0 ? 2 : 4;
    case 'sammel':
      return 3;
  }
}
