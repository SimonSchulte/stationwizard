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
