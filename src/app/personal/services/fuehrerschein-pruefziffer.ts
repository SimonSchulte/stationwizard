/**
 * Prüfziffer der Kartenführerscheinnummer nach dem in der deutschen
 * Wikipedia beschriebenen Verfahren
 * (https://de.wikipedia.org/wiki/F%C3%BChrerscheinnummer#Pr%C3%BCfziffer):
 * elf Zeichen – neun Stellen Behördenschlüssel und laufende Nummer, danach
 * die Prüfziffer, danach die Ausfertigungsnummer. Für die Prüfziffer wird
 * jede der ersten neun Stellen in eine Zahl umgewandelt (Ziffer bleibt
 * Ziffer, Buchstabe A=10 … Z=35), mit den Faktoren 9…1 multipliziert, die
 * Produkte addiert und der Rest der Division durch 11 gebildet; Rest 10
 * ergibt die Prüfziffer „X", sonst der Rest selbst. Am Beispiel B072RRE2I:
 * 11·9 + 0·8 + 7·7 + 2·6 + 27·5 + 27·4 + 14·3 + 2·2 + 18·1 = 467,
 * 467 mod 11 = 5.
 *
 * Reine Anzeigehilfe vor dem Download (siehe `fuehrerscheinliste.ts`) –
 * beeinflusst nicht die CSV (`fuehrerscheinliste-csv.ts`), die
 * Führerscheinnummern unverändert aus der HiOrg-Antwort übernimmt.
 */

/** Neun Stellen Behördenschlüssel/laufende Nummer, Prüfziffer, Ausfertigungsnummer. */
const FORM = /^([0-9A-Z]{9})([0-9X])[0-9A-Z]$/;

function zeichenwert(zeichen: string): number | null {
  if (/^[0-9]$/.test(zeichen)) return Number(zeichen);
  if (/^[A-Z]$/.test(zeichen)) return zeichen.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
  return null;
}

/** `null`: keine elfstellige Führerscheinnummer, also nicht prüfbar. */
export type PruefzifferErgebnis = 'gueltig' | 'ungueltig' | null;

export function fuehrerscheinnummerPruefzifferGueltig(
  fuehrerscheinnummer: string | null | undefined,
): PruefzifferErgebnis {
  if (!fuehrerscheinnummer) return null;
  const treffer = FORM.exec(fuehrerscheinnummer.trim().toUpperCase());
  if (!treffer) return null;
  const [, basis, pruefziffer] = treffer;

  let summe = 0;
  for (let i = 0; i < basis.length; i += 1) {
    const wert = zeichenwert(basis[i]);
    if (wert === null) return null;
    summe += wert * (9 - i);
  }
  const rest = summe % 11;
  const erwartet = rest === 10 ? 'X' : String(rest);
  return erwartet === pruefziffer ? 'gueltig' : 'ungueltig';
}
