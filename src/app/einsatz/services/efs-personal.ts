import type { Einsatzkraft } from '../models/planung.model';
import { normalisiereTitel } from './efs-abgleich';

/** Vergleichsform eines Namens („Nachname Vorname“), unabhängig von Schreibweise und Umlauten. */
export function namensSchluessel(name: string): string {
  return normalisiereTitel(name);
}

export interface PersonalVergleich {
  /** In EFS, aber noch nicht in der PEP. */
  neu: Einsatzkraft[];
  /** In der PEP, aber nicht (mehr) in EFS. */
  entfallen: Einsatzkraft[];
  unveraendert: number;
}

/**
 * Vergleicht die Einsatzkräfte der PEP mit denen aus EFS über den Namen. Nichts wird hier
 * verändert: Entfallene bleiben in der PEP, bis die Person sie selbst entfernt.
 */
export function vergleichePersonal(
  vorhanden: readonly Einsatzkraft[],
  ausEfs: readonly Einsatzkraft[],
): PersonalVergleich {
  const vorhandeneSchluessel = new Set(vorhanden.map((e) => namensSchluessel(e.name)));
  const efsSchluessel = new Set(ausEfs.map((e) => namensSchluessel(e.name)));
  const neu: Einsatzkraft[] = [];
  const gesehen = new Set<string>();
  for (const kraft of ausEfs) {
    const schluessel = namensSchluessel(kraft.name);
    if (vorhandeneSchluessel.has(schluessel) || gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    neu.push(kraft);
  }
  const entfallen = vorhanden.filter((e) => !efsSchluessel.has(namensSchluessel(e.name)));
  return {
    neu,
    entfallen,
    unveraendert: vorhanden.length - entfallen.length,
  };
}
