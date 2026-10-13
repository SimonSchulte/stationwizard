import { HiorgPersonalService } from '../../kern/hiorg/hiorg-personal.service';
import { personSchluessel } from './ehrungen-regeln';

export interface GruppenJePerson {
  /** Gruppen je Person, Schlüssel `personSchluessel()`. */
  gruppen: Map<string, string[]>;
  /** HiOrg-Anrede je Person (gleicher Schlüssel), nur wo erfasst; wird nie gespeichert. */
  anreden: Map<string, string>;
  /** HiOrg-Id je Person (gleicher Schlüssel); bei doppelt vorkommendem Namen fehlt der Eintrag. */
  ids: Map<string, string>;
  /** Warum keine Gruppen vorliegen; leer, wenn sie geladen werden konnten. */
  hinweis: string;
}

/**
 * Gruppen je Person für Seiten, deren Personen aus der Datenbank stammen und nicht aus HiOrg.
 * Best effort: ohne Verbindung oder bei einem Fehler ist `gruppen` leer und `hinweis` nennt den
 * Grund, die Seite bleibt nutzbar. Nichts wird gespeichert.
 */
export async function gruppenJePersonLaden(hiorg: HiorgPersonalService): Promise<GruppenJePerson> {
  const gruppen = new Map<string, string[]>();
  const anreden = new Map<string, string>();
  const ids = new Map<string, string>();
  const doppelt = new Set<string>();
  try {
    if ((await hiorg.verbindungLaden()) !== 'verbunden') {
      return {
        gruppen,
        anreden,
        ids,
        hinweis: 'Gruppen nicht verfügbar: Die HiOrg-Server-API ist nicht verbunden.',
      };
    }
    for (const person of await hiorg.personalLaden()) {
      const schluessel = personSchluessel(person.nachname, person.vorname);
      gruppen.set(schluessel, person.gruppen);
      if (person.anrede) anreden.set(schluessel, person.anrede);
      // Zwei Personen gleichen Namens: keine Id, statt womöglich die falsche Anschrift zu holen.
      if (ids.has(schluessel)) doppelt.add(schluessel);
      ids.set(schluessel, person.id);
    }
    for (const schluessel of doppelt) ids.delete(schluessel);
    return { gruppen, anreden, ids, hinweis: '' };
  } catch {
    return {
      gruppen: new Map(),
      anreden: new Map(),
      ids: new Map(),
      hinweis: 'Gruppen nicht verfügbar: Das HiOrg-Personal konnte nicht geladen werden.',
    };
  }
}
