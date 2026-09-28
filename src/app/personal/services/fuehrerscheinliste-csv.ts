import { formatiereDatum, zuIsoDatum } from '../../kern/kalender/datum';
import { schreibeCsv } from '../../kern/text/csv';
import type { HiorgPerson } from '../../kern/hiorg/hiorg-personal.service';

const SPALTEN = [
  'Nachname',
  'Vorname',
  'Klassen',
  'Beschränkung',
  'Führerscheinnummer',
  'Führerscheindatum',
] as const;

/** `DD.MM.YYYY` bei erkennbarem Datum, sonst der unveränderte Rohwert. */
export function fuehrerscheindatumAnzeige(datum: string | null | undefined): string {
  if (!datum) return '';
  const iso = zuIsoDatum(datum);
  return iso ? formatiereDatum(iso) : datum;
}

/**
 * Baut die CSV für die Führerscheinliste – Name, Vorname und alle vom Worker
 * durchgelassenen Fahrerlaubnisangaben (siehe `HiorgFahrerlaubnis`,
 * `worker/src/hiorg-api.ts`). Enthält jede geladene Person, auch ohne
 * erfasste Fahrerlaubnis, damit die Liste als vollständiges Register taugt.
 */
export function fuehrerscheinlisteCsv(personen: readonly HiorgPerson[]): string {
  const zeilen = personen.map((person) => {
    const fahrerlaubnis = person.fahrerlaubnis;
    return [
      person.nachname,
      person.vorname,
      fahrerlaubnis?.klassen.join(', ') ?? '',
      fahrerlaubnis?.beschraenkung ?? '',
      fahrerlaubnis?.fuehrerscheinnummer ?? '',
      fuehrerscheindatumAnzeige(fahrerlaubnis?.fuehrerscheindatum),
    ];
  });
  return schreibeCsv(SPALTEN, zeilen);
}
