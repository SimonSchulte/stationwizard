import type { AmpelFarbe } from '../components/ampel-chip/ampel-chip';
import type { Wartungstermin } from '../models/fahrzeug.model';
import type { KilometerAmpel } from './kilometer-soll';
import { sortiereOffeneWartungen, type WartungsAmpel } from './wartungsstatus';

/** Vereinheitlicht Kilometer- und Wartungsampel auf dieselbe Dreifarbdarstellung. */
export function ampelKlasse(ampel: KilometerAmpel | WartungsAmpel | null): AmpelFarbe {
  switch (ampel) {
    case 'rot':
    case 'ueberfaellig':
      return 'rot';
    case 'gelb':
    case 'warnung':
      return 'gelb';
    case 'gruen':
    case 'ok':
    case 'erledigt':
      return 'gruen';
    default:
      return 'neutral';
  }
}

export function tageBisFaelligText(tage: number): string {
  if (tage < 0) return `${Math.abs(tage)} Tage überfällig`;
  if (tage === 0) return 'heute fällig';
  return `in ${tage} Tagen fällig`;
}

export interface LeitTermin {
  bezeichnung: string;
  ampel: WartungsAmpel | null;
  text: string;
}

/** Der nächste offene Termin eines Fahrzeugs, oder ein Platzhalter, wenn keiner offen ist. */
export function ermittleLeitTermin(termine: readonly Wartungstermin[], heute: string): LeitTermin {
  const offene = sortiereOffeneWartungen(termine, heute);
  if (offene.length === 0) return { bezeichnung: 'Keine offenen Termine', ampel: null, text: '' };
  return {
    bezeichnung: offene[0].termin.bezeichnung,
    ampel: offene[0].ampel,
    text: tageBisFaelligText(offene[0].tageBisFaellig),
  };
}
