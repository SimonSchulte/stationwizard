import { Wartungstermin } from '../models/fahrzeug.model';

export type WartungsAmpel = 'erledigt' | 'ok' | 'warnung' | 'ueberfaellig';

export interface Wartungsstatus {
  termin: Wartungstermin;
  /** Tage bis zur Fälligkeit; negativ, wenn bereits überfällig. */
  tageBisFaellig: number;
  ampel: WartungsAmpel;
}

function tageDifferenz(vonIso: string, bisIso: string): number {
  const [vy, vm, vd] = vonIso.split('-').map(Number);
  const [by, bm, bd] = bisIso.split('-').map(Number);
  const TAG_MS = 86_400_000;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(vy, vm - 1, vd)) / TAG_MS);
}

/**
 * Ampelstatus eines Wartungstermins zum Stichtag. Der Vorlauf
 * (`erinnerungTage`) ist je Termin einstellbar, HU erhält keine
 * Sonderbehandlung in dieser Berechnung – sie ist fachlich hervorgehoben,
 * technisch aber ein Termin wie jeder andere.
 */
export function ermittleWartungsstatus(
  termin: Wartungstermin,
  stichtagIso: string,
): Wartungsstatus {
  if (termin.erledigtAm !== null) {
    return {
      termin,
      tageBisFaellig: tageDifferenz(stichtagIso, termin.faelligAm),
      ampel: 'erledigt',
    };
  }
  const tageBisFaellig = tageDifferenz(stichtagIso, termin.faelligAm);
  const ampel: WartungsAmpel =
    tageBisFaellig < 0
      ? 'ueberfaellig'
      : tageBisFaellig <= termin.erinnerungTage
        ? 'warnung'
        : 'ok';
  return { termin, tageBisFaellig, ampel };
}

/**
 * Offene (nicht erledigte) Wartungstermine über mehrere Fahrzeuge, nach
 * Fälligkeit sortiert – Grundlage der Dashboard-Liste.
 */
export function sortiereOffeneWartungen(
  termine: readonly Wartungstermin[],
  stichtagIso: string,
): Wartungsstatus[] {
  return termine
    .filter((t) => t.erledigtAm === null)
    .map((t) => ermittleWartungsstatus(t, stichtagIso))
    .sort((a, b) => a.tageBisFaellig - b.tageBisFaellig);
}
