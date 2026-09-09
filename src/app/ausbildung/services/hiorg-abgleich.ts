import { jahrVon, tageVonBis } from '../../kern/kalender/datum';
import { dekodiereEntitaeten } from '../../kern/text/entitaeten';
import type { HiorgEintrag } from '../models/hiorg-kalender.model';
import type { Termin } from '../models/plan.model';

/** Ein Plantermin, dessen Thema nicht exakt zum HiOrg-Eintrag desselben Tages passt. */
export interface HiorgAbweichung {
  readonly terminId: string;
  readonly terminThema: string;
  readonly hiorg: HiorgEintrag;
}

export interface HiorgTagesAbgleich {
  readonly datum: string;
  /** Alle HiOrg-Einträge dieses Tages, mehrtägige eingeschlossen. */
  readonly eintraege: readonly HiorgEintrag[];
  /** Einträge, deren Name zu keinem Thema des Tages passt, obwohl Themen da sind. */
  readonly abweichungen: readonly HiorgAbweichung[];
  /** Einträge an einem Tag ganz ohne benanntes Ausbildungsthema. */
  readonly ohneGegenstueck: readonly HiorgEintrag[];
}

export interface HiorgAbgleich {
  readonly nachDatum: ReadonlyMap<string, HiorgTagesAbgleich>;
  readonly anzahlAbweichungen: number;
  /** Datumswerte mit mindestens einer Abweichung – für den Filter im Raster. */
  readonly tageMitAbweichung: ReadonlySet<string>;
}

const LEERER_ABGLEICH: HiorgAbgleich = {
  nachDatum: new Map(),
  anzahlAbweichungen: 0,
  tageMitAbweichung: new Set(),
};

/**
 * Vergleichsform eines Namens: Entitäten auflösen, Whitespace vereinheitlichen,
 * trimmen, Groß-/Kleinschreibung angleichen. Bewusst **keine** Ähnlichkeitsstufe
 * und keine Interpunktionsentfernung – „nicht exakt" heißt hier wirklich
 * „nicht exakt" und führt zur Warnung.
 */
export function normalisiereName(text: string): string {
  return dekodiereEntitaeten(text)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('de-DE');
}

/**
 * Legt die HiOrg-Einträge tagesweise neben die Plantermine des Jahres.
 * Mehrtägige Einträge erscheinen an jedem betroffenen Tag; alles außerhalb des
 * Planjahres entfällt, jahresübergreifende Einträge werden beschnitten.
 */
export function baueHiorgAbgleich(
  eintraege: readonly HiorgEintrag[],
  termine: readonly Termin[],
  jahr: number,
): HiorgAbgleich {
  if (eintraege.length === 0) {
    return LEERER_ABGLEICH;
  }

  const nachDatum = new Map<string, HiorgTagesAbgleich>();
  const tageMitAbweichung = new Set<string>();
  const themenNachDatum = indexiereThemen(termine);
  let anzahlAbweichungen = 0;

  for (const [datum, tagesEintraege] of gruppiereNachTag(eintraege, jahr)) {
    const themen = themenNachDatum.get(datum) ?? [];
    const abweichungen: HiorgAbweichung[] = [];
    const ohneGegenstueck: HiorgEintrag[] = [];

    for (const eintrag of tagesEintraege) {
      const gesucht = normalisiereName(eintrag.name);
      if (themen.some((thema) => thema.normalisiert === gesucht)) {
        continue;
      }
      if (themen.length === 0) {
        // Kein benanntes Thema am Tag: keine Namensabweichung, sondern eine
        // Lücke im Plan – dafür gibt es das Werkzeug „Als Termin anlegen".
        ohneGegenstueck.push(eintrag);
        continue;
      }
      for (const thema of themen) {
        abweichungen.push({
          terminId: thema.terminId,
          terminThema: thema.text,
          hiorg: eintrag,
        });
      }
    }

    if (abweichungen.length > 0) {
      anzahlAbweichungen += abweichungen.length;
      tageMitAbweichung.add(datum);
    }
    nachDatum.set(datum, { datum, eintraege: tagesEintraege, abweichungen, ohneGegenstueck });
  }

  return { nachDatum, anzahlAbweichungen, tageMitAbweichung };
}

interface ThemaBezug {
  terminId: string;
  text: string;
  normalisiert: string;
}

/** Nur Termine mit echtem Thema zählen; leere Gerüstzeilen sind kein Gegenstück. */
function indexiereThemen(termine: readonly Termin[]): Map<string, ThemaBezug[]> {
  const nachDatum = new Map<string, ThemaBezug[]>();
  for (const termin of termine) {
    if (!termin.datum || termin.thema.trim() === '') {
      continue;
    }
    const bezug: ThemaBezug = {
      terminId: termin.id,
      text: termin.thema,
      normalisiert: normalisiereName(termin.thema),
    };
    const vorhanden = nachDatum.get(termin.datum);
    if (vorhanden) {
      vorhanden.push(bezug);
    } else {
      nachDatum.set(termin.datum, [bezug]);
    }
  }
  return nachDatum;
}

function gruppiereNachTag(
  eintraege: readonly HiorgEintrag[],
  jahr: number,
): Map<string, HiorgEintrag[]> {
  const nachDatum = new Map<string, HiorgEintrag[]>();
  for (const eintrag of eintraege) {
    for (const tag of tageVonBis(eintrag.beginn, eintrag.ende)) {
      if (jahrVon(tag) !== jahr) {
        continue;
      }
      const vorhanden = nachDatum.get(tag);
      if (vorhanden) {
        vorhanden.push(eintrag);
      } else {
        nachDatum.set(tag, [eintrag]);
      }
    }
  }
  return nachDatum;
}
