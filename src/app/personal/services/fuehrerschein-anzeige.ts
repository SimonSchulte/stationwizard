import { formatiereDatum, zuIsoDatum } from '../../kern/kalender/datum';

/**
 * `DD.MM.YYYY` bei erkennbarem Datum, sonst der unveränderte Rohwert aus der
 * HiOrg-Antwort. Gemeinsam für die Tabelle (`fuehrerscheinliste.ts`) und das
 * ausgefüllte Word-Dokument (`fuehrerschein-dokument.ts`).
 */
export function fuehrerscheindatumAnzeige(datum: string | null | undefined): string {
  if (!datum) return '';
  const iso = zuIsoDatum(datum);
  return iso ? formatiereDatum(iso) : datum;
}
