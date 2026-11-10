/**
 * Fachgruppen der Gruppenführungsrollen (siehe `Hauptrolle` in
 * `benutzerverwaltung/models/benutzerkonto.model.ts`), fachübergreifend gebraucht, zuerst
 * vom Fachgruppen-Konzept der Einsatzplanung. Hier statt in der Benutzerverwaltung, damit
 * kein Fachmodul das andere importieren muss.
 */
export type Fachgruppe = 'sanitaet' | 'betreuung' | 'verpflegung' | 'tesi' | 'fuehrung';

/** Reihenfolge der Anzeige. */
export const FACHGRUPPEN: readonly Fachgruppe[] = [
  'sanitaet',
  'betreuung',
  'verpflegung',
  'tesi',
  'fuehrung',
];

export const FACHGRUPPE_BEZEICHNUNG: Record<Fachgruppe, string> = {
  sanitaet: 'Sanität',
  betreuung: 'Betreuung',
  verpflegung: 'Verpflegung',
  tesi: 'TeSi',
  fuehrung: 'Führung',
};

/**
 * CSS-Variablenname der Kategorienfarbe (`src/tokens.less`). Betreuung und Verpflegung teilen
 * sich `--kat-btvp`; sie unterscheidet nur die Beschriftung.
 */
export const FACHGRUPPE_FARBVARIABLE: Record<Fachgruppe, string> = {
  sanitaet: '--kat-san',
  betreuung: '--kat-btvp',
  verpflegung: '--kat-btvp',
  tesi: '--kat-tesi',
  fuehrung: '--kat-fuehrung',
};

export function istFachgruppe(wert: unknown): wert is Fachgruppe {
  return typeof wert === 'string' && (FACHGRUPPEN as readonly string[]).includes(wert);
}
