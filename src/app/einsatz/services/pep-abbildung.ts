import {
  PepEinsatzkraft,
  PepInhalt,
  PepKennzahlen,
  PepPosition,
  PepPosten,
  PepVorlageInhalt,
} from '../models/pep.model';
import { Einsatzkraft, Planung, Position, Posten } from '../models/planung.model';

/**
 * Die eine Stelle zwischen dem Editor-Modell (`Planung`, englische Feldnamen, Namen an jeder
 * Zuordnung) und dem Datenbankvertrag (`PepInhalt`, Verweise über Einsatzkraft-Ids; siehe
 * `docs/konzept-einsatzplanung-vb.md`, Abschnitt 10). Titel, Zeitraum und HiOrg-Bezug gehören
 * dem Einsatz und werden hier nur für den Editor wieder zusammengesetzt.
 */

/** Angaben des Einsatzes, die der Editor als Teil der Planung führt. */
export interface PepKopf {
  id: string;
  name: string;
  start: string;
  end: string;
  hiorgEinsatzId?: string;
}

function leerZuNull(text: string | undefined | null): string | null {
  return text ? text : null;
}

function einsatzkraftZuPep(kraft: Einsatzkraft): PepEinsatzkraft {
  return {
    id: kraft.id,
    name: kraft.name,
    taktisch: [...(kraft.tags.taktisch ?? [])],
    medizinisch: [...(kraft.tags.medizinisch ?? [])],
    zusatz: [...(kraft.tags.zusatz ?? [])],
    notiz: leerZuNull(kraft.meta?.notes),
    hiorgOrgId: leerZuNull(kraft.hiorg_org_id),
    telefonnummer: leerZuNull(kraft.telefonnummer),
  };
}

function einsatzkraftZuPlanung(kraft: PepEinsatzkraft): Einsatzkraft {
  const tags: Einsatzkraft['tags'] = {};
  if (kraft.taktisch.length > 0) tags.taktisch = [...kraft.taktisch];
  if (kraft.medizinisch.length > 0) tags.medizinisch = [...kraft.medizinisch];
  if (kraft.zusatz.length > 0) tags.zusatz = [...kraft.zusatz];
  const ergebnis: Einsatzkraft = { id: kraft.id, name: kraft.name, tags };
  if (kraft.notiz !== null) ergebnis.meta = { notes: kraft.notiz };
  if (kraft.hiorgOrgId !== null) ergebnis.hiorg_org_id = kraft.hiorgOrgId;
  if (kraft.telefonnummer !== null) ergebnis.telefonnummer = kraft.telefonnummer;
  return ergebnis;
}

/**
 * Eine Zuordnung auf eine Einsatzkraft, die es in der Planung nicht gibt, würde in der
 * Datenbank ins Leere zeigen (der Worker lehnt das ab). Sie wird deshalb verworfen.
 */
function postenZuPep(
  posten: Posten,
  bekannt: ReadonlySet<string>,
  mitZuordnung: boolean,
): PepPosten {
  return {
    id: posten.id,
    bezeichnung: posten.label,
    fahrzeug: posten.fahrzeug
      ? {
          funkruf: posten.fahrzeug.funkruf,
          seriennummer: posten.fahrzeug.seriennummer,
          hiorgId: posten.fahrzeug.hiorgId,
        }
      : null,
    telefonnummer: leerZuNull(posten.telefonnummer),
    hiorgSchichtId: leerZuNull(posten.hiorg_schicht_id),
    positionen: posten.positions.map((position: Position): PepPosition => ({
      id: position.id,
      bezeichnung: position.label,
      anforderungen: {
        taktisch: position.requirements.taktisch,
        medizinisch: position.requirements.medizinisch,
        zusatz: leerZuNull(position.requirements.zusatz),
      },
      postenfuehrer: position.isPostenfuehrer === true,
      einsatzkraftId:
        mitZuordnung && position.assigned && bekannt.has(position.assigned.id)
          ? position.assigned.id
          : null,
    })),
  };
}

export function planungZuPepInhalt(planung: Planung): PepInhalt {
  const bekannt = new Set(planung.einsatzkraefte.map((k) => k.id));
  return {
    beschreibung: planung.beschreibung ?? '',
    posten: planung.posten.map((p) => postenZuPep(p, bekannt, true)),
    einsatzkraefte: planung.einsatzkraefte.map(einsatzkraftZuPep),
    einsatzleiterId:
      planung.einsatzleiter && bekannt.has(planung.einsatzleiter.id)
        ? planung.einsatzleiter.id
        : null,
  };
}

export function pepInhaltZuPlanung(inhalt: PepInhalt, kopf: PepKopf): Planung {
  const namen = new Map(inhalt.einsatzkraefte.map((k) => [k.id, k.name]));
  const posten: Posten[] = inhalt.posten.map((p) => {
    const ergebnis: Posten = {
      id: p.id,
      label: p.bezeichnung,
      fahrzeug: p.fahrzeug ? { ...p.fahrzeug } : null,
      positions: p.positionen.map((pos): Position => {
        const name = pos.einsatzkraftId === null ? undefined : namen.get(pos.einsatzkraftId);
        const position: Position = {
          id: pos.id,
          label: pos.bezeichnung,
          requirements: {
            taktisch: pos.anforderungen.taktisch,
            medizinisch: pos.anforderungen.medizinisch,
          },
          assigned:
            pos.einsatzkraftId !== null && name !== undefined
              ? { id: pos.einsatzkraftId, name }
              : null,
        };
        if (pos.anforderungen.zusatz !== null)
          position.requirements.zusatz = pos.anforderungen.zusatz;
        if (pos.postenfuehrer) position.isPostenfuehrer = true;
        return position;
      }),
    };
    if (p.hiorgSchichtId !== null) ergebnis.hiorg_schicht_id = p.hiorgSchichtId;
    if (p.telefonnummer !== null) ergebnis.telefonnummer = p.telefonnummer;
    return ergebnis;
  });
  const leiterName =
    inhalt.einsatzleiterId === null ? undefined : namen.get(inhalt.einsatzleiterId);
  const planung: Planung = {
    id: kopf.id,
    name: kopf.name,
    start: kopf.start,
    end: kopf.end,
    beschreibung: inhalt.beschreibung === '' ? null : inhalt.beschreibung,
    posten,
    einsatzkraefte: inhalt.einsatzkraefte.map(einsatzkraftZuPlanung),
    einsatzleiter:
      inhalt.einsatzleiterId !== null && leiterName !== undefined
        ? { id: inhalt.einsatzleiterId, name: leiterName }
        : null,
  };
  if (kopf.hiorgEinsatzId) planung.hiorg_einsatz_id = kopf.hiorgEinsatzId;
  return planung;
}

/** Posten und Beschreibung als Vorlage; Einsatzkräfte, Zuordnungen und Einsatzleitung entfallen. */
export function planungZuPepVorlageInhalt(planung: Planung): PepVorlageInhalt {
  return {
    beschreibung: planung.beschreibung ?? '',
    posten: planung.posten.map((p) => postenZuPep(p, new Set(), false)),
  };
}

/**
 * Kopiert die Posten einer Vorlage mit neuen Ids (Posten und Positionen) in eine PEP ohne
 * Einsatzkräfte und Einsatzleitung.
 */
export function pepVorlageAnwenden(
  vorlage: PepVorlageInhalt,
  neueId: () => string = () => crypto.randomUUID(),
): PepInhalt {
  return {
    beschreibung: vorlage.beschreibung,
    posten: vorlage.posten.map((p) => ({
      ...structuredClone(p),
      id: neueId(),
      positionen: p.positionen.map((pos) => ({
        ...structuredClone(pos),
        id: neueId(),
        einsatzkraftId: null,
      })),
    })),
    einsatzkraefte: [],
    einsatzleiterId: null,
  };
}

export function pepKennzahlen(inhalt: PepInhalt): PepKennzahlen {
  const positionen = inhalt.posten.flatMap((p) => p.positionen);
  return {
    posten: inhalt.posten.length,
    positionen: positionen.length,
    besetzt: positionen.filter((p) => p.einsatzkraftId !== null).length,
  };
}
