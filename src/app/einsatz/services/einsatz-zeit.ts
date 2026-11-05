const LOKAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const NUR_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const MIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

const BERLIN = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Bringt einen Zeitwert der HiOrg-Veranstaltung in die Einsatzform `YYYY-MM-DDTHH:mm`
 * (lokale Berliner Zeit, ohne Zone). Ein Wert mit Zone (`Z`, `+02:00`) wird nach Berlin
 * umgerechnet; ein Wert ohne Zone gilt bereits als Berliner Zeit und wird nur gekürzt; ein
 * reines Datum bekommt `T00:00`. Unlesbares ergibt `null`.
 */
export function hiorgZeitAlsLokal(text: string | null | undefined): string | null {
  const wert = (text ?? '').trim();
  if (!wert) return null;
  if (NUR_DATUM.test(wert)) return `${wert}T00:00`;
  const lokal = LOKAL.exec(wert);
  if (lokal) return `${lokal[1]}T${lokal[2]}`;
  if (!MIT_ZONE.test(wert)) return null;
  const zeitpunkt = new Date(wert);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  const teile = Object.fromEntries(BERLIN.formatToParts(zeitpunkt).map((t) => [t.type, t.value]));
  return `${teile['year']}-${teile['month']}-${teile['day']}T${teile['hour']}:${teile['minute']}`;
}
