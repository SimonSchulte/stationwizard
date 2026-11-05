import { monatIndex } from '../../kern/kalender/datum';
import { Kategorie } from '../models/plan.model';
import { hatBesondereZeit, zeitBereichText } from './datum-anzeige';
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
  /** Uhrzeit, wenn sie vom Dienstabend (19:00 bis 22:30) abweicht, sonst leer. */
  zeit: string;
}

export interface UeberblickMonat {
  index: number;
  zellen: UeberblickZelle[];
  /** Diensttage ohne Feiertag; Grundlage der Belegung „3/5“. */
  diensttage: number;
  /** Davon mit Ausbildungsthema. */
  belegt: number;
  luecken: number;
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
    diensttage: 0,
    belegt: 0,
    luecken: 0,
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
    const monatZeile = monate[monatIndex(slot.datum)]!;
    const zeitTermin = termin ?? slot.termine[0]?.termin ?? null;
    monatZeile.zellen.push({
      datum: slot.datum,
      nummer: slot.datum.slice(8, 10),
      titel: termin?.thema.trim() || slot.feiertag || '',
      kategorie: termin?.kategorie ?? '',
      luecke: slot.luecke,
      feiertag: slot.feiertag,
      abweichung,
      zeit: zeitTermin && hatBesondereZeit(zeitTermin) ? zeitBereichText(zeitTermin) : '',
    });
    if (!slot.feiertag) {
      monatZeile.diensttage++;
    }
    if (slot.luecke) {
      monatZeile.luecken++;
    } else if (termin) {
      monatZeile.belegt++;
    }
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
