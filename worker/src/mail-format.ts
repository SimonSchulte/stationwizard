/**
 * Gemeinsame Bausteine für Mailberichte: Farben, Maskierung und
 * Tabellenzellen.
 *
 * Bewusst ein eigenes Modul und nicht eine zweite Palette je Bericht. Die Werte
 * spiegeln die zentralen Design-Tokens aus `src/tokens.less`; eine Mail braucht
 * konkrete Werte statt CSS-Variablen, deshalb stehen sie hier ausgeschrieben –
 * aber genau einmal (siehe CLAUDE.md, Abschnitt „Darstellung").
 */
export const MAIL_FARBEN = {
  dunkelblau: '#000548',
  weiss: '#FFFFFF',
  text: '#333333',
  sekundaer: '#666666',
  hellgrau: '#C7CCD9',
  alternierendeZeile: '#F5F6FA',
  rot: '#EB003C',
  gruen: '#2F8F68',
} as const;

export function maskiere(wert: string): string {
  return wert
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function zahl(wert: number): string {
  return wert.toLocaleString('de-DE');
}

/** `YYYY-MM-DD` als `TT.MM.JJJJ`. */
export function datum(tag: string): string {
  const [jahr, monat, tagImMonat] = tag.split('-');
  return `${tagImMonat}.${monat}.${jahr}`;
}

/** `YYYY-MM` als `MM.JJJJ`; ein Verfallsdatum ist monatsgenau. */
export function monat(wert: string): string {
  const [jahr, monatsteil] = wert.split('-');
  return `${monatsteil}.${jahr}`;
}

export function kopfzelle(inhalt: string, ausrichtung = 'left'): string {
  return (
    `<th style="padding:8px 10px;text-align:${ausrichtung};font-size:12px;` +
    `letter-spacing:0.04em;text-transform:uppercase;color:${MAIL_FARBEN.weiss};` +
    `background-color:${MAIL_FARBEN.dunkelblau};">${inhalt}</th>`
  );
}

export function zelle(
  inhalt: string,
  ausrichtung = 'left',
  farbe: string = MAIL_FARBEN.text,
): string {
  return (
    `<td style="padding:8px 10px;text-align:${ausrichtung};font-size:13px;color:${farbe};` +
    `border-bottom:1px solid ${MAIL_FARBEN.hellgrau};">${inhalt}</td>`
  );
}
