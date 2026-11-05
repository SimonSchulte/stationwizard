import { MONATSNAMEN, formatiereDatum, tageZwischen, wochentag } from '../../kern/kalender/datum';
import {
  DIENSTABEND_BEGINN,
  DIENSTABEND_ENDE,
  Termin,
  istMehrtaegigerTermin,
} from '../models/plan.model';

/** Bis zu so vielen Tagen im Voraus zeigt der Kalender einen Abstand („in 6 Tagen“). */
export const ABSTAND_TAGE = 14;

export interface Abstand {
  text: string;
  /** Ein Diensttag ohne Ausbildung, der bald ansteht: wird gelb hervorgehoben. */
  dringend: boolean;
}

/**
 * Abstand eines Tages zu heute für die Pille im Kalender: „heute“, „morgen“, „in n Tagen“ für
 * die nächsten 14 Tage, sonst `null`. Vergangenes bekommt nie einen Abstand. Beide Seiten sind
 * Kalendertage, keine Zeitzone verschiebt das Ergebnis. `dringend` gilt nur für eine Lücke.
 */
export function abstandZuHeute(datum: string, heute: string, luecke = false): Abstand | null {
  const tage = tageZwischen(heute, datum);
  if (!Number.isFinite(tage) || tage < 0 || tage > ABSTAND_TAGE) {
    return null;
  }
  const text = tage === 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`;
  return { text, dringend: luecke && tage > 0 };
}

/**
 * Die Uhrzeit eines Dienstabends (19:00 bis 22:30) ist der Normalfall und wird im Raster nicht
 * wiederholt. Ein Dienst mit anderer Zeit und jeder Termin mit einer Zeit gelten als abweichend.
 */
export function hatBesondereZeit(termin: Termin): boolean {
  if (!termin.beginnZeit && !termin.endeZeit) {
    return false;
  }
  return !(
    termin.typ === 'dienst' &&
    termin.beginnZeit === DIENSTABEND_BEGINN &&
    termin.endeZeit === DIENSTABEND_ENDE
  );
}

/** „bis 21:30“, „ab 18:00“ oder der volle Bereich; leer ohne Zeit. */
export function zeitBisText(termin: Termin): string {
  const { beginnZeit, endeZeit } = termin;
  if (endeZeit) {
    return `bis ${endeZeit}`;
  }
  return beginnZeit ? `ab ${beginnZeit}` : '';
}

/** Der volle Zeitbereich, etwa „18:00–20:00“; leer ohne Zeit. */
export function zeitBereichText(termin: Termin): string {
  const { beginnZeit, endeZeit } = termin;
  if (beginnZeit && endeZeit) {
    return `${beginnZeit}–${endeZeit}`;
  }
  return beginnZeit || (endeZeit ? `bis ${endeZeit}` : '');
}

/**
 * Untere Zeile des Datumsblocks eines Tages: Wochentag und Beginn („Di · 19:00“). Ein
 * mehrtägiger Termin zeigt den Zeitraum der Wochentage („Sa–So“). Bei mehreren Terminen am
 * Tag steht nur der Wochentag, weil ein Beginn dann nicht eindeutig ist.
 */
export function blockZeile(datum: string, termine: readonly Termin[]): string {
  const tag = wochentag(datum);
  if (termine.length !== 1) {
    return tag;
  }
  const termin = termine[0]!;
  if (istMehrtaegigerTermin(termin) && termin.datum === datum && termin.datumBis) {
    return `${tag}–${wochentag(termin.datumBis)}`;
  }
  // Der Beginn gehört zum ersten Tag; Fortsetzungstage nennen nur den Wochentag.
  return termin.beginnZeit && termin.datum === datum ? `${tag} · ${termin.beginnZeit}` : tag;
}

/** „2 Tage · bis So 08.03.“ für den ersten Tag eines mehrtägigen Termins; sonst leer. */
export function mehrtaegigText(termin: Termin, anzahlTage: number): string {
  if (!termin.datumBis) {
    return '';
  }
  const bis = termin.datumBis;
  return `${anzahlTage} Tage · bis ${wochentag(bis)} ${formatiereDatum(bis).slice(0, 6)}`;
}

/** „März 2026“ für den Monatstrenner. */
export function monatsTitel(datum: string): string {
  return `${MONATSNAMEN[Number(datum.slice(5, 7)) - 1]} ${datum.slice(0, 4)}`;
}

/** „MÄR“ für den Datumsblock; 3 Buchstaben in Großschrift. */
export function monatKurz(datum: string): string {
  return MONATSNAMEN[Number(datum.slice(5, 7)) - 1]!.slice(0, 3).toUpperCase();
}

/** „1. APR“ für den Monatsersten im Raster; sonst `null`. */
export function monatsErsterMarke(datum: string): string | null {
  return datum.slice(8, 10) === '01' ? `1. ${monatKurz(datum)}` : null;
}
