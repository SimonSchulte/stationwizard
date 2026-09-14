/**
 * Leitet einen lesbaren Anzeigenamen und Initialen aus der vom Worker
 * geprüften E-Mail-Adresse ab. Access liefert keinen verifizierten Namen oder
 * ein Profilbild; ein `/cdn-cgi/access/get-identity`-Aufruf wäre eine neue,
 * bislang nicht durch die offizielle Dokumentation belegte Abhängigkeit und
 * bleibt daher bewusst aus. Der Avatar ist ein klassischer Initialenkreis,
 * keine echte Google-Profilbildabfrage.
 */

const TRENNER = /[._+-]+/;

/** "max.mustermann@juh-beispiel.de" → "Max Mustermann". */
export function anzeigenameAusEmail(email: string): string {
  const lokalTeil = email.split('@')[0].trim();
  const teile = lokalTeil
    .split(TRENNER)
    .map((teil) => teil.trim())
    .filter((teil) => teil.length > 0)
    .map((teil) => teil.charAt(0).toUpperCase() + teil.slice(1).toLowerCase());
  return teile.length > 0 ? teile.join(' ') : email;
}

/** "Max Mustermann" → "MM"; einzelnes Wort ergibt nur den ersten Buchstaben. */
export function initialenAusAnzeigename(anzeigename: string): string {
  const teile = anzeigename
    .trim()
    .split(/\s+/)
    .filter((teil) => teil.length > 0);
  if (teile.length === 0) return '?';
  const erste = teile[0].charAt(0);
  const letzte = teile.length > 1 ? teile[teile.length - 1].charAt(0) : '';
  const initialen = (erste + letzte).toUpperCase();
  return initialen.length > 0 ? initialen : '?';
}
