import { MONATSNAMEN, jahrVon, monatIndex, wochentag } from '../../kern/kalender/datum';

const LOKAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/;

interface Teile {
  datum: string;
  zeit: string;
}

function zerlegen(wert: string | null): Teile | null {
  const treffer = wert === null ? null : LOKAL.exec(wert);
  return treffer ? { datum: `${treffer[3]}.${treffer[2]}.${treffer[1]}`, zeit: treffer[4] } : null;
}

/**
 * Zeitraum eines Einsatzes für die Anzeige (`de-DE`). Die Werte sind lokale Berliner Zeit
 * `YYYY-MM-DDTHH:mm` und werden nur umgestellt, nie über `Date` gelesen – so verschiebt keine
 * Zeitzone den Kalendertag. Leer, wenn kein Beginn vorliegt und auch kein Ende.
 */
export function einsatzZeitraumText(beginn: string | null, ende: string | null): string {
  const von = zerlegen(beginn);
  const bis = zerlegen(ende);
  if (!von && !bis) return '';
  if (von && !bis) return `${von.datum}, ${von.zeit} Uhr`;
  if (!von && bis) return `bis ${bis.datum}, ${bis.zeit} Uhr`;
  if (von && bis) {
    return von.datum === bis.datum
      ? `${von.datum}, ${von.zeit}–${bis.zeit} Uhr`
      : `${von.datum}, ${von.zeit} – ${bis.datum}, ${bis.zeit} Uhr`;
  }
  return '';
}

const OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;
const BEGINN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/;

function zweistellig(zahl: number): string {
  return String(zahl).padStart(2, '0');
}

/** Lokale Zeit eines `Date` als `YYYY-MM-DDTHH:mm`. */
export function lokaleZeitText(datum: Date): string {
  return (
    `${datum.getFullYear()}-${zweistellig(datum.getMonth() + 1)}-${zweistellig(datum.getDate())}` +
    `T${zweistellig(datum.getHours())}:${zweistellig(datum.getMinutes())}`
  );
}

/**
 * Bringt einen Zeitwert (lokal `YYYY-MM-DDTHH:mm`, EFS-Text `YYYY-MM-DD HH:mm:ss` oder ISO mit
 * Zone) in die lokale Form `YYYY-MM-DDTHH:mm`. Werte ohne Zone werden nur umgestellt, nie über
 * `Date` gelesen; nur ein Wert mit ausdrücklicher Zone wird in die lokale Zeit umgerechnet.
 * `null`, wenn der Wert fehlt oder nicht lesbar ist.
 */
export function lokalerBeginn(wert: string | null | undefined): string | null {
  if (!wert) return null;
  if (OFFSET.test(wert) && wert.length > 10) {
    const datum = new Date(wert);
    return Number.isNaN(datum.getTime()) ? null : lokaleZeitText(datum);
  }
  const treffer = BEGINN.exec(wert);
  if (treffer) return `${treffer[1]}T${treffer[2]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(wert) ? `${wert}T00:00` : null;
}

export interface Datumsblock {
  /** Monat kurz in Großbuchstaben, mit Jahr, wenn nicht das aktuelle. */
  monat: string;
  tag: string;
  /** Wochentag und Uhrzeit, etwa `Sa · 10:00`. */
  wochentagZeit: string;
}

/** Inhalt des Datumsblocks einer Karte; `null` ohne lesbaren Beginn. */
export function datumsblock(beginn: string | null, aktuellesJahr: number): Datumsblock | null {
  const lokal = lokalerBeginn(beginn);
  if (!lokal) return null;
  const jahr = jahrVon(lokal);
  const kurz = MONATSNAMEN[monatIndex(lokal)].slice(0, 3).toUpperCase();
  return {
    monat: jahr === aktuellesJahr ? kurz : `${kurz} ${jahr}`,
    tag: String(Number(lokal.slice(8, 10))),
    wochentagZeit: `${wochentag(lokal.slice(0, 10))} · ${lokal.slice(11, 16)}`,
  };
}
