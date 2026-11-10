import type { AbschnittFarbe } from './vb.model';

/**
 * Datenvertrag des Aufbaus (Packliste eines Einsatzes), identisch mit dem Worker
 * (`docs/konzept-packeinheiten.md`, Abschnitt 4). Alle Ids sind UUIDs. Zettel und Schilder werden
 * aus diesem Inhalt abgeleitet und nie gespeichert.
 */

export type AufbauPhase = 'vorher' | 'zum-schluss';
export type EinheitTyp = 'fahrzeug' | 'wagen';

/** Grenzen laut Vertrag; der Worker prüft dieselben Werte. */
export const AUFBAU_GRENZEN = {
  einheiten: 60,
  eintraegeJeEinheit: 200,
  kistenAnzahl: 99,
  kistenPositionen: 100,
  name: 100,
  anweisung: 2000,
  anweisungen: 6000,
  bemerkung: 200,
  foto: 100_000,
} as const;

export interface AufbauArtikelEintrag {
  art: 'artikel';
  id: string;
  artikelId: string;
  menge: number;
  bemerkung: string;
  /** Lager, aus dem der Artikel geholt wird; `null`: das Heimatlager fehlt. */
  lagerId: string | null;
  phase: AufbauPhase | null;
}

export interface AufbauKistenPosition {
  artikelId: string;
  menge: number;
  bemerkung: string;
}

/** Momentaufnahme einer Kiste; spätere Änderungen an den Stammdaten wirken nicht rückwirkend. */
export interface AufbauKistenEintrag {
  art: 'kiste';
  id: string;
  /** Nur zur Nachverfolgung; die Kiste darf in den Stammdaten inzwischen fehlen. */
  kisteId: string | null;
  name: string;
  lagerId: string | null;
  anzahl: number;
  inhalt: AufbauKistenPosition[];
  phase: AufbauPhase | null;
}

export interface AufbauWagenEintrag {
  art: 'wagen';
  id: string;
  einheit: AufbauEinheit;
}

export type AufbauEintrag = AufbauArtikelEintrag | AufbauKistenEintrag | AufbauWagenEintrag;

export interface AufbauEinheit {
  id: string;
  typ: EinheitTyp;
  name: string;
  farbe: AbschnittFarbe;
  /** JPEG-Data-URL; fehlt, wenn es kein Foto gibt. */
  foto?: string;
  anweisung: string;
  bemerkung: string;
  inhalt: AufbauEintrag[];
}

export interface AufbauInhalt {
  anweisungen: string;
  einheiten: AufbauEinheit[];
}

export interface Aufbau {
  vorlageId: string | null;
  vorlageVersion: number | null;
  inhalt: AufbauInhalt;
}

export interface AufbauVorlage {
  id: string;
  titel: string;
  inhalt: AufbauInhalt;
}

export interface AufbauVorlageKopf {
  id: string;
  titel: string;
  version: number;
  einheiten: number;
  kisten: number;
  positionen: number;
  geaendertAm: string;
}
