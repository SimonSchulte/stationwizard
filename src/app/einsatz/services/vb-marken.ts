import { VbInhalt } from '../models/vb.model';
import { VbAenderung } from './vb-abgleich';

export type LaufzettelMarkeArt = 'neu' | 'geaendert';

/**
 * Welche Laufzettel einer Vorbereitung von der Vorlage abweichen: ohne `herkunftId` (neu,
 * dupliziert, abgetrennt) gelten sie als „neu“, mit Herkunft als „geändert“, wenn der Abgleich
 * eine Änderung für das Gegenstück in der Vorlage meldet (Schlüssel
 * `laufzettel:geaendert:<Vorlagen-Id>`, siehe `vb-abgleich.ts`). Unveränderte fehlen.
 */
export function laufzettelMarken(
  inhalt: VbInhalt,
  abweichungen: readonly VbAenderung[],
): Map<string, LaufzettelMarkeArt> {
  const schluessel = new Set(abweichungen.map((a) => a.schluessel));
  const marken = new Map<string, LaufzettelMarkeArt>();
  for (const abschnitt of inhalt.abschnitte) {
    for (const laufzettel of abschnitt.laufzettel) {
      if (laufzettel.herkunftId === null) marken.set(laufzettel.id, 'neu');
      else if (schluessel.has(`laufzettel:geaendert:${laufzettel.herkunftId}`)) {
        marken.set(laufzettel.id, 'geaendert');
      }
    }
  }
  return marken;
}
