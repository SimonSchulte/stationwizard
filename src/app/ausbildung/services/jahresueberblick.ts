import { monatIndex } from '../../kern/kalender/datum';
import { Kategorie } from '../models/plan.model';
import { WochenZeile } from './plan-raster';

/** Ein Diensttag des Jahres im Überblick. */
export interface UeberblickZelle {
  datum: string;
  /** Tag im Monat, zweistellig. */
  nummer: string;
  titel: string;
  kategorie: Kategorie | '';
  luecke: boolean;
  feiertag: string | null;
  /** Der Tag trägt eine abweichende HiOrg-Bezeichnung. */
  abweichung: boolean;
}

export interface UeberblickMonat {
  index: number;
  zellen: UeberblickZelle[];
}

export interface UeberblickKennzahlen {
  diensttage: number;
  belegt: number;
  luecken: number;
  abweichungen: number;
  nachKategorie: ReadonlyMap<Kategorie | '', number>;
}

export interface Jahresueberblick {
  monate: UeberblickMonat[];
  kennzahlen: UeberblickKennzahlen;
}

/**
 * Baut den Jahresüberblick aus dem Wochenraster: nur die Diensttage des
 * Jahres, nach Monat gruppiert. Rein abgeleitet, nichts wird gespeichert.
 */
export function baueJahresueberblick(
  wochen: readonly WochenZeile[],
  tageMitAbweichung: ReadonlySet<string>,
): Jahresueberblick {
  const monate: UeberblickMonat[] = Array.from({ length: 12 }, (_, index) => ({
    index,
    zellen: [],
  }));
  const nachKategorie = new Map<Kategorie | '', number>();
  let luecken = 0;
  let belegt = 0;
  let abweichungen = 0;

  for (const slot of wochen.flatMap((woche) => woche.tage)) {
    if (!slot.imJahr || !slot.istDiensttag) {
      continue;
    }
    const termin = slot.termine.find((t) => t.termin.thema.trim())?.termin ?? null;
    const abweichung = tageMitAbweichung.has(slot.datum);
    monate[monatIndex(slot.datum)]!.zellen.push({
      datum: slot.datum,
      nummer: slot.datum.slice(8, 10),
      titel: termin?.thema.trim() || slot.feiertag || '',
      kategorie: termin?.kategorie ?? '',
      luecke: slot.luecke,
      feiertag: slot.feiertag,
      abweichung,
    });
    if (slot.luecke) {
      luecken++;
    } else if (termin) {
      belegt++;
      nachKategorie.set(termin.kategorie, (nachKategorie.get(termin.kategorie) ?? 0) + 1);
    }
    if (abweichung) {
      abweichungen++;
    }
  }
  const diensttage = monate.reduce((summe, monat) => summe + monat.zellen.length, 0);
  return { monate, kennzahlen: { diensttage, belegt, luecken, abweichungen, nachKategorie } };
}
