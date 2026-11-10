import { AufbauEinheit, AufbauInhalt, AufbauPhase } from '../models/aufbau.model';
import { Artikel, Lager } from '../models/stammdaten.model';
import { AbschnittFarbe } from '../models/vb.model';
import { LAUFZETTEL_KAPAZITAET } from './laufzettel-platz';

/**
 * Leitet aus dem Aufbau die Zettel ab (Konzept `docs/konzept-packeinheiten.md`, Abschnitte 3 und 6):
 * je Einheit (Fahrzeug oder Wagen, auch ein Wagen im Fahrzeug) ein Zettel. Gespeichert wird nichts;
 * dieselbe Ableitung speist Vorschau, Prüfung und Druck.
 */

export interface ZettelTrenner {
  art: 'trenner';
  /** `null` für „ohne Heimatlager“ und den Wagen-Block. */
  lagerId: string | null;
  text: string;
}

export interface ZettelZeile {
  art: 'zeile';
  /** `artikel`, `kiste` oder `wagen`. */
  quelle: 'artikel' | 'kiste' | 'wagen';
  text: string;
  /** Menge mit Einheit und Bemerkung, bei einer Kiste die Zahl ihrer Positionen. */
  menge: string;
  /** Bezeichnung ohne Anzahl („Verbandkiste“); der Druck setzt die Anzahl in eine eigene Spalte. */
  bezeichnung: string;
  /** Nur die Zahl („85“, „2“) für die schmale Spalte des gedruckten Zettels (der Druck setzt „×“ dazu). */
  anzahl: string;
  /** Rest der Menge („Liter (80–90)“, „14 Pos.“) für den Text der gedruckten Zeile. */
  zusatz: string;
  /** Kennung des Eintrags im Aufbau (zum Springen aus der Vorschau). */
  eintragId: string;
}

export type ZettelPosten = ZettelTrenner | ZettelZeile;

export interface Zettel {
  /** Laufende Nummer in Reihenfolge des Aufbaus, ab 1. */
  nr: number;
  einheitId: string;
  name: string;
  typ: AufbauEinheit['typ'];
  /** Farbe des obersten Ziels; ein Wagen im Fahrzeug erbt die des Fahrzeugs. */
  farbe: AbschnittFarbe;
  /** Name des Fahrzeugs, wenn der Zettel zu einem Wagen im Fahrzeug gehört. */
  inFahrzeug: string | null;
  /** Erstes Lager auf dem Zettel („VON“), sonst `null`. */
  von: string | null;
  posten: ZettelPosten[];
  /** Belegte Rasterzeilen, Lagertrenner eingerechnet. */
  belegt: number;
  kapazitaet: number;
  /** Anzahl nötiger Streifen; mehr als 1 heißt: Fortsetzungsstreifen. */
  streifen: number;
}

export interface ZettelStammdaten {
  lager: readonly Lager[];
  artikel: readonly Artikel[];
}

const PHASEN_RANG: Record<'vorher' | 'mitte' | 'zum-schluss', number> = {
  vorher: 0,
  mitte: 1,
  'zum-schluss': 2,
};

function rang(phase: AufbauPhase | null): number {
  return PHASEN_RANG[phase ?? 'mitte'];
}

function phasenZusatz(phase: AufbauPhase | null): string {
  if (phase === 'vorher') return ' · zuerst';
  if (phase === 'zum-schluss') return ' · zum Schluss';
  return '';
}

function zahlText(menge: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(menge);
}

/** Einheit und Bemerkung ohne die Zahl: „Liter (80–90)“. */
function mengeZusatz(einheit: string, bemerkung: string): string {
  const b = bemerkung.trim();
  return [einheit, b ? `(${b})` : ''].filter(Boolean).join(' ');
}

/** Menge wie auf dem Zettel: „85 Liter (80–90)“. */
export function mengeText(menge: number, einheit: string, bemerkung: string): string {
  return [zahlText(menge), mengeZusatz(einheit, bemerkung)].filter(Boolean).join(' ');
}

interface Gruppe {
  rang: number;
  reihenfolge: number;
  phase: AufbauPhase | null;
  lagerId: string | null;
  titel: string;
  zeilen: ZettelZeile[];
}

function zettelFuer(
  einheit: AufbauEinheit,
  nr: number,
  farbe: AbschnittFarbe,
  inFahrzeug: string | null,
  daten: ZettelStammdaten,
): Zettel {
  const lagerNachId = new Map(daten.lager.map((l) => [l.id, l]));
  const artikelNachId = new Map(daten.artikel.map((a) => [a.id, a]));
  const gruppen = new Map<string, Gruppe>();
  const gruppe = (phase: AufbauPhase | null, lagerId: string | null, wagen = false): Gruppe => {
    const lager = lagerId ? lagerNachId.get(lagerId) : undefined;
    const schluessel = `${rang(phase)}|${wagen ? 'wagen' : (lager?.id ?? 'ohne')}`;
    let g = gruppen.get(schluessel);
    if (!g) {
      g = {
        rang: rang(phase),
        reihenfolge: wagen
          ? Number.MAX_SAFE_INTEGER
          : (lager?.reihenfolge ?? Number.MAX_SAFE_INTEGER - 1),
        phase,
        lagerId: wagen ? null : (lager?.id ?? null),
        titel: wagen ? 'Wagen' : (lager?.name ?? 'Ohne Heimatlager'),
        zeilen: [],
      };
      gruppen.set(schluessel, g);
    }
    return g;
  };

  for (const eintrag of einheit.inhalt) {
    if (eintrag.art === 'kiste') {
      gruppe(eintrag.phase, eintrag.lagerId).zeilen.push({
        art: 'zeile',
        quelle: 'kiste',
        text: `${eintrag.anzahl}× ${eintrag.name}`,
        menge: `${eintrag.inhalt.length} Pos.`,
        bezeichnung: eintrag.name,
        anzahl: String(eintrag.anzahl),
        zusatz: `${eintrag.inhalt.length} Pos.`,
        eintragId: eintrag.id,
      });
    } else if (eintrag.art === 'artikel') {
      const artikel = artikelNachId.get(eintrag.artikelId);
      gruppe(eintrag.phase, eintrag.lagerId).zeilen.push({
        art: 'zeile',
        quelle: 'artikel',
        text: artikel?.name ?? 'Unbekannter Artikel',
        menge: mengeText(eintrag.menge, artikel?.einheit ?? '', eintrag.bemerkung),
        bezeichnung: artikel?.name ?? 'Unbekannter Artikel',
        anzahl: zahlText(eintrag.menge),
        zusatz: mengeZusatz(artikel?.einheit ?? '', eintrag.bemerkung),
        eintragId: eintrag.id,
      });
    } else {
      gruppe(null, null, true).zeilen.push({
        art: 'zeile',
        quelle: 'wagen',
        text: `${eintrag.einheit.name} (Wagen)`,
        menge: `${eintrag.einheit.inhalt.length} Einträge`,
        bezeichnung: `${eintrag.einheit.name} (Wagen)`,
        anzahl: '1',
        zusatz: `${eintrag.einheit.inhalt.length} Einträge`,
        eintragId: eintrag.id,
      });
    }
  }

  const geordnet = [...gruppen.values()].sort(
    (a, b) => a.rang - b.rang || a.reihenfolge - b.reihenfolge,
  );
  const posten: ZettelPosten[] = [];
  for (const g of geordnet) {
    posten.push({ art: 'trenner', lagerId: g.lagerId, text: g.titel + phasenZusatz(g.phase) });
    // Gepackte Einheiten (Kisten) vor losen Artikeln; sonst bleibt die Reihenfolge des Aufbaus.
    posten.push(...g.zeilen.filter((z) => z.quelle === 'kiste'));
    posten.push(...g.zeilen.filter((z) => z.quelle !== 'kiste'));
  }
  const erstes = geordnet.find((g) => g.titel !== 'Wagen');
  const belegt = posten.length;
  return {
    nr,
    einheitId: einheit.id,
    name: einheit.name,
    typ: einheit.typ,
    farbe,
    inFahrzeug,
    von: erstes ? erstes.titel : null,
    posten,
    belegt,
    kapazitaet: LAUFZETTEL_KAPAZITAET,
    streifen: Math.max(1, Math.ceil(belegt / LAUFZETTEL_KAPAZITAET)),
  };
}

/** Ein Zettel je Einheit in Reihenfolge des Aufbaus; ein Wagen im Fahrzeug folgt dem Fahrzeug. */
export function leiteZettelAb(inhalt: AufbauInhalt, daten: ZettelStammdaten): Zettel[] {
  const zettel: Zettel[] = [];
  for (const einheit of inhalt.einheiten) {
    zettel.push(zettelFuer(einheit, zettel.length + 1, einheit.farbe, null, daten));
    for (const eintrag of einheit.inhalt) {
      if (eintrag.art === 'wagen') {
        zettel.push(
          zettelFuer(eintrag.einheit, zettel.length + 1, einheit.farbe, einheit.name, daten),
        );
      }
    }
  }
  return zettel;
}

export type AufbauSortierung = 'lager' | 'nummer';

/** Reihenfolge des Aushangs: nach dem ersten Lager des Zettels (Laufweg) oder nach Nummer. */
export function sortiereAushang(
  zettel: readonly Zettel[],
  sortierung: AufbauSortierung,
  lager: readonly Lager[],
): Zettel[] {
  if (sortierung === 'nummer') return [...zettel].sort((a, b) => a.nr - b.nr);
  const reihenfolge = new Map(lager.map((l) => [l.name, l.reihenfolge]));
  const ohne = Number.MAX_SAFE_INTEGER;
  return [...zettel].sort(
    (a, b) =>
      (a.von ? (reihenfolge.get(a.von) ?? ohne) : ohne) -
        (b.von ? (reihenfolge.get(b.von) ?? ohne) : ohne) || a.nr - b.nr,
  );
}
