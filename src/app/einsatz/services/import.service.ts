import { Injectable } from '@angular/core';
import {
  Einsatzkraft,
  EfsEinsatzkraft,
  Medizinisch,
  MEDIZINISCH_ORDER,
  Taktisch,
  TAKTISCH_ORDER,
} from '../models/planung.model';
import type { HiorgPerson } from '../../kern/hiorg/hiorg-personal.service';
import { bezeichnungZuKuerzel } from './qualifikation-zuordnung';

@Injectable({ providedIn: 'root' })
export class ImportService {
  parseRoster(text: string): Einsatzkraft[] {
    const seen = new Set<string>();
    const result: Einsatzkraft[] = [];

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;

      const match = line.match(/^(.+?)\s*(?:\(([^)]*)\))?$/);
      if (!match) continue;

      const name = match[1].trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const taktisch: Taktisch[] = [];
      const medizinisch: Medizinisch[] = [];
      const zusatz: string[] = [];

      if (match[2]) {
        for (const raw of match[2].split('|')) {
          const tag = raw.trim().toUpperCase();
          if (!tag) continue;
          const taktischMatch = TAKTISCH_ORDER.find((t) => t.toUpperCase() === tag);
          const medizinischMatch = MEDIZINISCH_ORDER.find((m) => m.toUpperCase() === tag);
          if (taktischMatch) taktisch.push(taktischMatch);
          else if (medizinischMatch) medizinisch.push(medizinischMatch);
          else zusatz.push(tag);
        }
      }

      result.push({
        id: crypto.randomUUID(),
        name,
        tags: {
          ...(taktisch.length ? { taktisch } : {}),
          ...(medizinisch.length ? { medizinisch } : {}),
          ...(zusatz.length ? { zusatz } : {}),
        },
      });
    }

    return result;
  }

  /** Maps an EfsEinsatzkraft to our Einsatzkraft domain model. */
  mapEfsEinsatzkraft(ek: EfsEinsatzkraft): Einsatzkraft {
    return {
      id: crypto.randomUUID(),
      name: `${ek.nachname} ${ek.vorname}`.trim(),
      hiorg_org_id: ek.hiorg_org_id,
      tags: this.tagsAus(ek.ausbildungen ?? []),
      telefonnummer: ek.telefonnummer,
    };
  }

  /**
   * Person aus der HiOrg-Server-API. Die Personen-ID dort ist eine andere
   * Kennung als die EFS-Einsatzkraft-ID in `hiorg_org_id` und wird deshalb
   * nicht übernommen; Duplikate erkennt die Übernahme am Namen.
   */
  mapHiorgPerson(person: HiorgPerson): Einsatzkraft {
    const ausbildungen = person.qualifikationen
      .map((q) => (q.name ? bezeichnungZuKuerzel(q.name) : (q.kurz ?? '')))
      .filter((wert) => wert.trim() !== '');
    return {
      id: crypto.randomUUID(),
      name: `${person.nachname} ${person.vorname}`.trim(),
      tags: this.tagsAus(ausbildungen),
      ...(person.telefon ? { telefonnummer: person.telefon } : {}),
    };
  }

  private tagsAus(ausbildungen: string[]): Einsatzkraft['tags'] {
    const taktisch: Taktisch[] = [];
    const medizinisch: Medizinisch[] = [];
    const zusatz: string[] = [];

    for (const ausbildung of ausbildungen) {
      const tag = ausbildung.trim().toUpperCase();
      const taktischMatch = TAKTISCH_ORDER.find((t) => t.toUpperCase() === tag);
      const medizinischMatch = MEDIZINISCH_ORDER.find((m) => m.toUpperCase() === tag);
      if (taktischMatch) taktisch.push(taktischMatch);
      else if (medizinischMatch) medizinisch.push(medizinischMatch);
      else if (ausbildung.trim()) zusatz.push(ausbildung.trim());
    }

    return {
      ...(taktisch.length ? { taktisch } : {}),
      ...(medizinisch.length ? { medizinisch } : {}),
      ...(zusatz.length ? { zusatz } : {}),
    };
  }
}
