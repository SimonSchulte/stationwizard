const MONATSKUERZEL = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

const TAKTISCHER_FORMATIERER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Taktische Zeit in Berlin: TThhmmMMMJJ, beispielsweise „091430mar26“. */
export function formatiereTaktischeZeit(datum: Date): string {
  const teile = TAKTISCHER_FORMATIERER.formatToParts(datum);
  const leseTeil = (art: Intl.DateTimeFormatPartTypes): string =>
    teile.find((teil) => teil.type === art)?.value ?? '00';
  const tag = leseTeil('day');
  const stunde = leseTeil('hour');
  const minute = leseTeil('minute');
  const monat = MONATSKUERZEL[Number(leseTeil('month')) - 1];
  const jahr = leseTeil('year');
  return `${tag}${stunde}${minute}${monat}${jahr}`;
}

/** Lesbare Anzeige desselben Berliner Zeitpunkts, etwa „09.03.2026, 14:30 Uhr“. */
export function formatiereTaktischeZeitAnzeige(datum: Date): string {
  return `${new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(datum)} Uhr`;
}
