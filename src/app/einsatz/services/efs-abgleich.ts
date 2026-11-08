import type { EfsEinsatzGruppe } from '../models/efs.model';

/** Vergleichsform eines Titels: ohne Groß-/Kleinschreibung, Umlaute, Satzzeichen und Doppelleerzeichen. */
export function normalisiereTitel(titel: string): string {
  return titel
    .toLocaleLowerCase('de')
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function woerter(titel: string): string[] {
  return normalisiereTitel(titel)
    .split(' ')
    .filter((wort) => wort.length > 1);
}

/** Anteil gemeinsamer Wörter an allen vorkommenden Wörtern (0 bis 1). */
export function titelAehnlichkeit(a: string, b: string): number {
  const wa = new Set(woerter(a));
  const wb = new Set(woerter(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let gemeinsam = 0;
  for (const wort of wa) if (wb.has(wort)) gemeinsam += 1;
  return gemeinsam / (wa.size + wb.size - gemeinsam);
}

/** Ab diesem Anteil gemeinsamer Wörter gilt ein Titel als „ähnlich“ und wird zur Prüfung vorgelegt. */
export const AEHNLICH_AB = 0.5;

export type EfsAbgleichArt = 'treffer' | 'pruefen' | 'keiner';

export interface EfsKandidat {
  gruppe: EfsEinsatzGruppe;
  /** Titel nach Normalisierung identisch. */
  titelGleich: boolean;
  titelAehnlichkeit: number;
}

export interface EfsAbgleich {
  art: EfsAbgleichArt;
  /** Bei `treffer` der eine Treffer, sonst `null`. */
  treffer: EfsEinsatzGruppe | null;
  /** Bei `pruefen` die Kandidaten, beste zuerst. */
  kandidaten: EfsKandidat[];
}

const KEINER: EfsAbgleich = { art: 'keiner', treffer: null, kandidaten: [] };

/** `JJJJ-MM-TT` aus einem lokalen oder ISO-Zeitpunkt; `null` bei unlesbarem Wert. */
export function kalendertag(wert: string | null): string | null {
  const treffer = wert ? /^(\d{4}-\d{2}-\d{2})/.exec(wert.trim()) : null;
  return treffer ? treffer[1] : null;
}

/**
 * Gleicht eine Veranstaltung aus dem Kalenderfeed mit den EFS-Veranstaltungen ab.
 *
 * - **Treffer:** genau eine EFS-Veranstaltung mit gleichem Titel (normalisiert), an deren
 *   Kalendertagen der Beginn liegt.
 * - **Prüfen:** mehrere solche Treffer oder nur ähnliche Titel (mindestens `AEHNLICH_AB`) am
 *   selben Kalendertag.
 * - **Keiner:** sonst. Ein gleicher Titel an einem anderen Tag zählt nicht (Serientermine).
 *
 * Der Feed kennt keinen Ort, deshalb geht er nicht ein.
 */
export function gleicheMitEfsAb(
  titel: string,
  beginn: string | null,
  gruppen: readonly EfsEinsatzGruppe[],
): EfsAbgleich {
  const tag = kalendertag(beginn);
  if (!tag || normalisiereTitel(titel) === '') return KEINER;
  const gesucht = normalisiereTitel(titel);

  const kandidaten: EfsKandidat[] = [];
  for (const gruppe of gruppen) {
    const von = kalendertag(gruppe.datum_von);
    const bis = kalendertag(gruppe.datum_bis) ?? von;
    if (!von || !bis || tag < von || tag > bis) continue;
    const gleich = normalisiereTitel(gruppe.titel) === gesucht;
    const aehnlich = titelAehnlichkeit(titel, gruppe.titel);
    if (gleich || aehnlich >= AEHNLICH_AB) {
      kandidaten.push({ gruppe, titelGleich: gleich, titelAehnlichkeit: gleich ? 1 : aehnlich });
    }
  }
  if (kandidaten.length === 0) return KEINER;
  kandidaten.sort(
    (a, b) =>
      Number(b.titelGleich) - Number(a.titelGleich) || b.titelAehnlichkeit - a.titelAehnlichkeit,
  );
  const gleiche = kandidaten.filter((k) => k.titelGleich);
  if (gleiche.length === 1) return { art: 'treffer', treffer: gleiche[0].gruppe, kandidaten };
  return { art: 'pruefen', treffer: null, kandidaten };
}
