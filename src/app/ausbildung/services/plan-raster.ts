import { Termin, terminTage } from '../models/plan.model';
import {
  Wochentag,
  zeitAlsMinuten,
  isoWochennummer,
  jahrVon,
  versetzeTage,
  wochenImJahr,
  wochentag,
} from '../../kern/kalender/datum';

/**
 * Ein Tag im Wochenraster.
 *
 * Das Raster ist abgeleitet, nicht gespeichert: Es entsteht aus allen Kalenderwochen
 * des Jahres, allen Terminen der Mappe und allen Feiertagen. Anders als die Excel
 * (die nur die Diensttage als echte Zeilen führt) zeigt der Raster **jeden** Tag
 * jeder Woche – nur so lassen sich Wochen als Ganzes erkennen und Termine auch auf
 * einen anderen Wochentag als den Diensttag legen.
 */
/**
 * Stellung eines Termins an einem einzelnen Tag. Ein mehrtägiger Termin steht
 * an jedem seiner Tage im Raster; nur `beginn` trägt die vollständige Karte,
 * `mitte` und `ende` sind Fortsetzungen desselben Termins.
 */
export type Segment = 'einzeln' | 'beginn' | 'mitte' | 'ende';

/** Ein Termin an einem Tag, zusammen mit seiner Stellung im Zeitraum. */
export interface SlotTermin {
  termin: Termin;
  segment: Segment;
}

export interface PlanSlot {
  datum: string;
  tag: Wochentag;
  istDiensttag: boolean;
  /** `false` an den Rändern des Jahres, wenn die Woche ins Nachbarjahr hineinragt. */
  imJahr: boolean;
  feiertag: string | null;
  /** 0..n Einträge der Mappe an diesem Datum, nach Uhrzeit sortiert. */
  termine: SlotTermin[];
  /** Diensttag ohne Feiertag und ohne Ausbildungsthema – die rot markierte Lücke. */
  luecke: boolean;
}

export interface WochenZeile {
  nummer: number;
  start: string;
  ende: string;
  /** Genau 7 Slots, Montag bis Sonntag. */
  tage: PlanSlot[];
  luecken: number;
}

export function baueWochenraster(
  jahr: number,
  termine: readonly Termin[],
  feiertage: ReadonlyMap<string, string>,
  diensttag: Wochentag,
): WochenZeile[] {
  const nachDatum = indexiereNachDatum(termine);

  return wochenImJahr(jahr).map(({ start, ende }) => {
    const tage: PlanSlot[] = [];
    for (let datum = start; datum <= ende; datum = versetzeTage(datum, 1)) {
      tage.push(baueSlot(datum, jahr, diensttag, nachDatum.get(datum) ?? [], feiertage));
    }
    return {
      nummer: isoWochennummer(start),
      start,
      ende,
      tage,
      // Randtage des Nachbarjahres zählen nicht mit – sonst wirkt die erste
      // oder letzte Wochenzeile fälschlich unvollständig.
      luecken: tage.filter((t) => t.luecke && t.imJahr).length,
    };
  });
}

function baueSlot(
  datum: string,
  jahr: number,
  diensttag: Wochentag,
  eintraege: SlotTermin[],
  feiertage: ReadonlyMap<string, string>,
): PlanSlot {
  const feiertagName = feiertage.get(datum) ?? null;
  const istDiensttag = wochentag(datum) === diensttag;
  return {
    datum,
    tag: wochentag(datum),
    istDiensttag,
    imJahr: jahrVon(datum) === jahr,
    feiertag: feiertagName,
    termine: eintraege,
    // Ein Diensttag mitten in einem mehrtägigen Lehrgang ist keine Lücke: das
    // Thema steht am Beginn des Termins, gilt aber für jeden seiner Tage.
    luecke: istDiensttag && !feiertagName && !eintraege.some((e) => e.termin.thema.trim()),
  };
}

/**
 * Trägt jeden Termin an **allen** Tagen ein, die er belegt, und ordnet die
 * Einträge eines Tages nach Uhrzeit – Termine ohne Uhrzeit hinten, damit ein
 * Rookies-Termin um 18:00 vor dem Dienstabend um 19:30 steht.
 */
function indexiereNachDatum(termine: readonly Termin[]): Map<string, SlotTermin[]> {
  const nachDatum = new Map<string, SlotTermin[]>();
  for (const termin of termine) {
    const tage = terminTage(termin);
    tage.forEach((tag, index) => {
      const segment: Segment =
        tage.length === 1
          ? 'einzeln'
          : index === 0
            ? 'beginn'
            : index === tage.length - 1
              ? 'ende'
              : 'mitte';
      const vorhanden = nachDatum.get(tag);
      if (vorhanden) {
        vorhanden.push({ termin, segment });
      } else {
        nachDatum.set(tag, [{ termin, segment }]);
      }
    });
  }
  for (const eintraege of nachDatum.values()) {
    eintraege.sort(
      (a, b) =>
        // Mehrtägige Termine stehen in jeder Tageszelle an derselben Stelle,
        // sonst versetzt eine Uhrzeit den Balken gegenüber seiner Fortsetzung.
        Number(b.segment !== 'einzeln') - Number(a.segment !== 'einzeln') ||
        beginnMinuten(a.termin) - beginnMinuten(b.termin),
    );
  }
  return nachDatum;
}

/** Termine ohne Uhrzeit sortieren ans Tagesende, nicht an den Tagesanfang. */
function beginnMinuten(termin: Termin): number {
  return zeitAlsMinuten(termin.beginnZeit) ?? Number.MAX_SAFE_INTEGER;
}
