/**
 * Kalenderhilfen des Workers. Bewusst ein eigenes, abhängigkeitsfreies Modul:
 * sowohl der Kilometerstandsbericht als auch die öffentliche Kilometermeldung
 * brauchen denselben Kalendertag, und die öffentliche Meldung soll dafür nicht
 * den ganzen Berichtsbaustein hereinziehen.
 */

/**
 * Berliner Kalendertag als `YYYY-MM-DD`, nie über eine UTC-Konvertierung
 * (siehe CLAUDE.md). `en-CA` liefert genau diese Reihenfolge.
 */
export function berlinerKalendertag(zeitpunkt: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(zeitpunkt);
}
