/**
 * Leitet einen lesbaren Anzeigenamen und Initialen aus der vom Worker
 * geprüften E-Mail-Adresse ab. Das Access-App-JWT trägt keinen verifizierten
 * Namen; der Anzeigename bleibt deshalb aus der E-Mail-Adresse abgeleitet.
 * Ein echtes Google-Profilbild liefert best-effort `Benutzerkontext.profilbildUrl`
 * über `/api/benutzer/profilbild` (`worker/src/profilbild.ts` kapselt den dafür
 * nötigen zusätzlichen Aufruf gegen Cloudflare Access). Die Initialen hier
 * bleiben der Rückfall, solange kein Bild vorliegt.
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
