import { HiorgPersonalService } from '../../kern/hiorg/hiorg-personal.service';
import { personSchluessel } from './ehrungen-regeln';

/**
 * Gruppen je Person (Schlüssel `personSchluessel()`) für Seiten, deren Personen aus der
 * Datenbank stammen und nicht aus HiOrg. Best effort: ohne Verbindung oder bei einem Fehler ist
 * das Ergebnis leer, die Seite bleibt ohne Gruppenfilter nutzbar. Nichts wird gespeichert.
 */
export async function gruppenJePersonLaden(
  hiorg: HiorgPersonalService,
): Promise<Map<string, string[]>> {
  const ergebnis = new Map<string, string[]>();
  try {
    if ((await hiorg.verbindungLaden()) !== 'verbunden') return ergebnis;
    for (const person of await hiorg.personalLaden()) {
      ergebnis.set(personSchluessel(person.nachname, person.vorname), person.gruppen);
    }
  } catch {
    ergebnis.clear();
  }
  return ergebnis;
}
