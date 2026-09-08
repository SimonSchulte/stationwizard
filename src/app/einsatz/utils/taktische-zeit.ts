const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Formats a Date as taktische Zeit: TThhmmMMMJJ — e.g. "091430mar26" */
export function formatTaktischeZeit(date: Date): string {
  const d = date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  // Use the Date object directly to avoid locale-parsing
  const tz = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => tz.find((p) => p.type === type)?.value ?? '00';
  const dd = get('day');
  const hh = get('hour') === '24' ? '00' : get('hour');
  const mm = get('minute');
  const mon = MONTHS[parseInt(get('month'), 10) - 1];
  const yy = get('year');

  return `${dd}${hh}${mm}${mon}${yy}`;
}

/** Human-readable display: "09.03.2026, 14:30 Uhr" */
export function formatTaktischeZeitDisplay(date: Date): string {
  return (
    new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(date) + ' Uhr'
  );
}
