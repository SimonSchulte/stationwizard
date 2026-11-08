import type { Einsatzkraft, Planung, Position } from '../models/planung.model';
import type { MatchLevel } from './match.service';

/** Abgleich einer Einsatzkraft mit einer Position; im Editor `MatchService.matchLevel`. */
export type Abgleich = (position: Position, person: Einsatzkraft) => MatchLevel;

export interface Vorschlag {
  einsatzkraft: Einsatzkraft;
  /** `full`: erfüllt alle Anforderungen; `partial`: erfüllt nur einen Teil. */
  eignung: 'full' | 'partial';
}

/** Hinweis im Helferpool: wohin eine verfügbare Person passt bzw. wo sie eingeteilt ist. */
export interface PoolHinweis {
  art: 'passt' | 'eingeteilt';
  text: string;
}

/** Gruppe offener Positionen mit gleicher Anforderung, etwa „2 × NotSan“. */
export interface OffeneAnforderung {
  bezeichnung: string;
  anzahl: number;
  /** Mindestens eine dieser Positionen hat keine passende verfügbare Einsatzkraft. */
  luecke: boolean;
}

function hatAnforderung(position: Position): boolean {
  return position.requirements.taktisch !== null || position.requirements.medizinisch !== null;
}

/**
 * Die besten Kandidaten für eine Position: vollständig passende zuerst, dann teilweise
 * passende, jeweils nach Name. Wer nicht passt, wird nicht vorgeschlagen.
 */
export function vorschlaegeFuerPosition(
  position: Position,
  kandidaten: readonly Einsatzkraft[],
  abgleich: Abgleich,
  hoechstens = 3,
): Vorschlag[] {
  const treffer: Vorschlag[] = [];
  for (const einsatzkraft of kandidaten) {
    const stufe = abgleich(position, einsatzkraft);
    if (stufe === 'full' || stufe === 'partial') treffer.push({ einsatzkraft, eignung: stufe });
  }
  return treffer
    .sort(
      (a, b) =>
        Number(a.eignung === 'partial') - Number(b.eignung === 'partial') ||
        a.einsatzkraft.name.localeCompare(b.einsatzkraft.name, 'de'),
    )
    .slice(0, hoechstens);
}

/** Erste offene Position mit Anforderung, auf die die Person vollständig passt. */
export function passendeOffenePosition(
  person: Einsatzkraft,
  planung: Planung,
  abgleich: Abgleich,
): { postenLabel: string; positionLabel: string } | null {
  for (const posten of planung.posten) {
    for (const position of posten.positions) {
      if (position.assigned || !hatAnforderung(position)) continue;
      if (abgleich(position, person) === 'full') {
        return { postenLabel: posten.label, positionLabel: position.label };
      }
    }
  }
  return null;
}

/** Hinweise für den Helferpool: Verfügbare mit passendem Platz, Eingeteilte mit ihrem Platz. */
export function poolHinweise(
  planung: Planung,
  verfuegbar: readonly Einsatzkraft[],
  abgleich: Abgleich,
): Map<string, PoolHinweis> {
  const hinweise = new Map<string, PoolHinweis>();
  for (const person of verfuegbar) {
    const platz = passendeOffenePosition(person, planung, abgleich);
    if (platz) hinweise.set(person.id, { art: 'passt', text: `Passt: ${platz.positionLabel}` });
  }
  for (const posten of planung.posten) {
    for (const position of posten.positions) {
      if (position.assigned) {
        hinweise.set(position.assigned.id, {
          art: 'eingeteilt',
          text: `${posten.label} · ${position.label}`,
        });
      }
    }
  }
  return hinweise;
}

/**
 * Offene Positionen mit Anforderung, nach Anforderung gruppiert. Lücken (keine verfügbare
 * Person passt) stehen vorn, dann die größere Gruppe.
 */
export function offeneAnforderungen(
  planung: Planung,
  verfuegbar: readonly Einsatzkraft[],
  abgleich: Abgleich,
): OffeneAnforderung[] {
  const gruppen = new Map<string, OffeneAnforderung>();
  for (const posten of planung.posten) {
    for (const position of posten.positions) {
      if (position.assigned || !hatAnforderung(position)) continue;
      const { taktisch, medizinisch } = position.requirements;
      const bezeichnung = [taktisch, medizinisch].filter(Boolean).join(' + ');
      const luecke = !verfuegbar.some((person) => abgleich(position, person) === 'full');
      const gruppe = gruppen.get(bezeichnung) ?? { bezeichnung, anzahl: 0, luecke: false };
      gruppe.anzahl += 1;
      gruppe.luecke = gruppe.luecke || luecke;
      gruppen.set(bezeichnung, gruppe);
    }
  }
  return [...gruppen.values()].sort(
    (a, b) =>
      Number(b.luecke) - Number(a.luecke) ||
      b.anzahl - a.anzahl ||
      a.bezeichnung.localeCompare(b.bezeichnung, 'de'),
  );
}
