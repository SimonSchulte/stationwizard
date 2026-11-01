import { isoZuLokalesDatum } from '../../../kern/kalender/datum';
import {
  EHRENZEICHEN,
  EHRUNG_SCHLUESSEL,
  LEISTUNGSABZEICHEN,
  ansprueche,
  gruppeVon,
  hatErhalten,
  leistungAbgleich,
  mitgliedsjahre,
  staffelHinweise,
  wirksameStunden,
  type Ansprueche,
  type EhrungPerson,
  type EhrungSchluessel,
  type LeistungAbgleich,
} from '../../services/ehrungen-regeln';
import type { EhrungAenderung } from '../../services/ehrungen.service';

/**
 * Reine Tabellenlogik des Ehrungsmanagers: eine Zeile aus gespeichertem Stand und Entwurf,
 * Filter und Sortierung. Ohne Angular, damit sie sich ohne Seite prüfen lässt.
 */

export interface Zeile {
  person: EhrungPerson;
  /** Angezeigter Stand: gespeicherter Stand mit den noch ungesicherten Änderungen darüber. */
  stand: EhrungAenderung;
  /** Warnungen je Gruppe (Reihenfolge von `gruppen`): Anspruch über die vergebbare Stufe hinaus, Lücken. */
  hinweise: string[][];
  /** Person mit allen noch nicht gespeicherten Änderungen; Grundlage aller Berechnungen und Exporte. */
  aktuell: EhrungPerson;
  ansprueche: Ansprueche;
  jahre: number | null;
  abgleich: LeistungAbgleich;
  /** Einmal je Berechnung erzeugt: ein neues Date je Prüfung ließe die Bindung nie zur Ruhe kommen. */
  eintrittAlsDatum: Date | null;
  geaendert: boolean;
}

export type StatusFilter = 'alle' | 'erhalten' | 'faellig' | 'ohne-jahr';

/** Gleicher fachlicher Stand, unabhängig von der Reihenfolge der erhaltenen Auszeichnungen. */
export function stimmtUeberein(a: EhrungAenderung, b: EhrungAenderung): boolean {
  const schluesselA = Object.keys(a.erhalten) as EhrungSchluessel[];
  return (
    a.stundenManuell === b.stundenManuell &&
    a.stundenManuellStand === b.stundenManuellStand &&
    a.eintrittsdatum === b.eintrittsdatum &&
    a.besondereVerdienste === b.besondereVerdienste &&
    schluesselA.length === Object.keys(b.erhalten).length &&
    schluesselA.every(
      (schluessel) =>
        hatErhalten(b.erhalten, schluessel) && a.erhalten[schluessel] === b.erhalten[schluessel],
    )
  );
}

/** Eine Tabellenzeile: gespeicherter Stand, darüber ein ungesicherter Entwurf. */
export function zeileBerechnen(
  person: EhrungPerson,
  bearbeitet: EhrungAenderung | undefined,
  jahr: number,
): Zeile {
  const gespeichert: EhrungAenderung = {
    stundenManuell: person.stundenManuell,
    stundenManuellStand: person.stundenManuellStand,
    eintrittsdatum: person.eintrittsdatum,
    besondereVerdienste: person.besondereVerdienste,
    erhalten: person.erhalten,
  };
  const stand = bearbeitet ?? gespeichert;
  const aktuell: EhrungPerson = {
    ...person,
    ...stand,
    stunden: wirksameStunden(person.stundenImport, stand.stundenManuell),
  };
  const zeile: Zeile = {
    person,
    stand,
    aktuell,
    ansprueche: ansprueche(aktuell, jahr),
    hinweise: [],
    jahre: mitgliedsjahre(stand.eintrittsdatum, jahr),
    abgleich: leistungAbgleich(aktuell.stunden, stand.erhalten),
    eintrittAlsDatum: stand.eintrittsdatum ? isoZuLokalesDatum(stand.eintrittsdatum) : null,
    geaendert: bearbeitet !== undefined,
  };
  const a = zeile.ansprueche;
  zeile.hinweise = [
    staffelHinweise(stand.erhalten, a.leistung, LEISTUNGSABZEICHEN),
    [],
    [],
    staffelHinweise(stand.erhalten, a.ehrenzeichen, EHRENZEICHEN),
  ];
  return zeile;
}

export function passtZuFilter(
  zeile: Zeile,
  gewaehlt: readonly EhrungSchluessel[],
  status: StatusFilter,
): boolean {
  if (gewaehlt.length === 0 && status === 'alle') return true;
  const schluessel = gewaehlt.length > 0 ? gewaehlt : EHRUNG_SCHLUESSEL;
  return schluessel.some((eintrag) => {
    const hat = hatErhalten(zeile.stand.erhalten, eintrag);
    const anspruch = zeile.ansprueche[gruppeVon(eintrag)];
    const zuVergeben = anspruch.erfuellt === eintrag;
    const offen = anspruch.offen.includes(eintrag);
    switch (status) {
      case 'erhalten':
        return hat;
      case 'faellig':
        return offen;
      case 'ohne-jahr':
        return hat && zeile.stand.erhalten[eintrag] === null;
      default:
        return hat || zuVergeben;
    }
  });
}

export type Sortierspalte = 'nachname' | 'vorname' | 'stunden' | 'eintritt' | string;

/** Sortiert nach der gewählten Spalte; gleiche Werte bleiben nach Nach- und Vorname geordnet. */
export function sortiereZeilen(
  liste: readonly Zeile[],
  spalte: Sortierspalte,
  richtung: 'asc' | 'desc',
): Zeile[] {
  const wert = (zeile: Zeile): string | number => {
    switch (spalte) {
      case 'nachname':
        return zeile.person.nachname.toLocaleLowerCase('de');
      case 'vorname':
        return zeile.person.vorname.toLocaleLowerCase('de');
      case 'stunden':
        return zeile.aktuell.stunden;
      case 'eintritt':
        return zeile.stand.eintrittsdatum ?? '';
      default:
        return zeile.jahre ?? -1;
    }
  };
  const faktor = richtung === 'asc' ? 1 : -1;
  return [...liste].sort((a, b) => {
    const x = wert(a);
    const y = wert(b);
    const vergleich =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), 'de');
    return (
      faktor * vergleich ||
      a.person.nachname.localeCompare(b.person.nachname, 'de') ||
      a.person.vorname.localeCompare(b.person.vorname, 'de')
    );
  });
}
