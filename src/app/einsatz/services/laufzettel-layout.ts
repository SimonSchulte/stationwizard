import { Fachgruppe } from '../../kern/fachgruppen/fachgruppe';
import { lagerSchluessel } from './lager';
import { AbschnittFarbe, VbInhalt, VbLaufzettel, VbPosition } from '../models/vb.model';
import {
  LAUFZETTEL_KAPAZITAET,
  STREIFEN_STANDARD,
  laufzettelNummern,
  laufzettelPlatz,
} from './laufzettel-platz';

/** Ein bedruckter Streifen: ein Laufzettel oder der Fortsetzungsstreifen eines zu vollen. */
export interface LaufzettelStreifen {
  /** Laufende Nummer des Laufzettels (bei Fortsetzungen die des Originals). */
  nr: number;
  istFortsetzung: boolean;
  abschnitt: { titel: string; farbe: AbschnittFarbe };
  /** Nummer des Abschnitts (= des Schilds, auf das verladen wird) und Zahl der Abschnitte. */
  schild: number;
  schildGesamt: number;
  /** Eigene Fachgruppe des Laufzettels, sonst die Vorgabe des Abschnitts. */
  fachgruppe: Fachgruppe | null;
  ueberschrift: string;
  lagerort: string;
  transportMit: string;
  auftraggeber: string;
  positionen: VbPosition[];
  /** Von Positionen und Umbruchzeilen der Infofelder belegte Materialzeilen. */
  belegt: number;
  /** Nicht belegte Zeilen des festen Rasters (für Nachträge von Hand): `23 − belegt`. */
  leereZeilen: number;
}

/**
 * Teilt die Positionen eines Laufzettels so auf, dass jeder Teil höchstens die Kapazität
 * belegt. Der Platzbedarf kommt ausschließlich aus `laufzettelPlatz()`, damit Editorwarnung
 * und Ausdruck übereinstimmen. Jeder Teil enthält mindestens eine Position.
 */
function teilePositionen(laufzettel: VbLaufzettel, streifenJeSeite: number): VbPosition[][] {
  if (laufzettelPlatz(laufzettel, streifenJeSeite).zustand !== 'zu-voll')
    return [laufzettel.positionen];
  const infoKosten = laufzettelPlatz({ ...laufzettel, positionen: [] }, streifenJeSeite).belegt;
  const verfuegbar = Math.max(1, LAUFZETTEL_KAPAZITAET - infoKosten);
  const teile: VbPosition[][] = [];
  let aktuell: VbPosition[] = [];
  let belegt = 0;
  for (const position of laufzettel.positionen) {
    const zeilen =
      laufzettelPlatz({ ...laufzettel, positionen: [position] }, streifenJeSeite).belegt -
      infoKosten;
    if (aktuell.length > 0 && belegt + zeilen > verfuegbar) {
      teile.push(aktuell);
      aktuell = [];
      belegt = 0;
    }
    aktuell.push(position);
    belegt += zeilen;
  }
  if (aktuell.length > 0) teile.push(aktuell);
  return teile;
}

/**
 * Je Laufzettel ein Streifen in Druckreihenfolge; ein zu voller Laufzettel erzeugt zusätzlich
 * Fortsetzungsstreifen mit denselben Kopfdaten, nie eine kleinere Schrift.
 */
export function baueLaufzettelStreifen(
  inhalt: VbInhalt,
  streifenJeSeite: number = STREIFEN_STANDARD,
  sortierung: AushangSortierung = 'abschnitt',
): LaufzettelStreifen[] {
  const nummern = laufzettelNummern(inhalt);
  const streifen: LaufzettelStreifen[] = [];
  inhalt.abschnitte.forEach((abschnitt, abschnittIndex) => {
    for (const eigenes of abschnitt.laufzettel) {
      // Ohne eigenes „Transport mit“ gilt der Abschnitt als Ziel: er ist das Schild.
      const laufzettel = {
        ...eigenes,
        transportMit: eigenes.transportMit.trim() || abschnitt.titel,
      };
      const teile = teilePositionen(laufzettel, streifenJeSeite);
      teile.forEach((positionen, index) => {
        const belegt = laufzettelPlatz({ ...laufzettel, positionen }, streifenJeSeite).belegt;
        streifen.push({
          nr: nummern.get(laufzettel.id) ?? 0,
          schild: abschnittIndex + 1,
          schildGesamt: inhalt.abschnitte.length,
          istFortsetzung: index > 0,
          abschnitt: { titel: abschnitt.titel, farbe: abschnitt.farbe },
          fachgruppe: laufzettel.fachgruppe ?? abschnitt.fachgruppe,
          ueberschrift: laufzettel.ueberschrift,
          lagerort: laufzettel.lagerort,
          transportMit: laufzettel.transportMit,
          auftraggeber: laufzettel.auftraggeber,
          positionen,
          belegt,
          leereZeilen: Math.max(0, LAUFZETTEL_KAPAZITAET - belegt),
        });
      });
    }
  });
  return sortierung === 'lager' ? nachLagerSortiert(streifen) : streifen;
}

/** Reihenfolge am Aushang: nach Ziel (Abschnitt, wie in der Vorbereitung) oder nach Lager. */
export type AushangSortierung = 'abschnitt' | 'lager';

/**
 * Sortiert nach Lager, dann nach LfdNr; Laufzettel ohne Lager stehen zuletzt, ein Fortsetzungs-
 * streifen bleibt hinter seinem Original. Die LfdNr ändern sich nicht: das Schild nutzt sie
 * als Schlüssel zum Laufzettel.
 */
export function nachLagerSortiert(streifen: readonly LaufzettelStreifen[]): LaufzettelStreifen[] {
  return streifen
    .map((s, index) => ({ s, index, lager: lagerSchluessel(s.lagerort) }))
    .sort((a, b) => {
      if ((a.lager === '') !== (b.lager === '')) return a.lager === '' ? 1 : -1;
      return a.lager.localeCompare(b.lager, 'de') || a.s.nr - b.s.nr || a.index - b.index;
    })
    .map((e) => e.s);
}

/** Verteilt die Streifen auf Seiten zu je `proSeite`; die letzte darf kürzer sein. */
export function seitenAufteilen(
  streifen: readonly LaufzettelStreifen[],
  proSeite: number = STREIFEN_STANDARD,
): LaufzettelStreifen[][] {
  const seiten: LaufzettelStreifen[][] = [];
  for (let i = 0; i < streifen.length; i += proSeite) {
    seiten.push(streifen.slice(i, i + proSeite));
  }
  return seiten;
}
