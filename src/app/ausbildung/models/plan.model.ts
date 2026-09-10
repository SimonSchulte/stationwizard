/**
 * Domänenmodell des Ausbildungsplaners.
 *
 * Ein `PlanDocument` bildet genau das ab, was in der Excel-Arbeitsmappe steht:
 * den Jahresplan, das Ideen-Backlog ("Offene Ideen") und die eigene
 * KatS-Ausbildungsplan-Themenliste, über die quer referenziert wird.
 */

import { tageVonBis } from '../../kern/kalender/datum';

/**
 * Feed-kompatible Unterscheidung eines Eintrags: ein regulärer Dienst
 * (Dienstabend, Ausbildungsdienst) oder ein sonstiger Termin (Veranstaltung,
 * Lehrgang, Besprechung). Die Werte entsprechen dem Feld `typ` des
 * HiOrg-Kalenderfeeds, damit übernommene Einträge ihre Einordnung behalten.
 *
 * Nicht zu verwechseln mit `TerminArt` weiter unten: `typ` ist eine gepflegte
 * Eigenschaft des Eintrags, `TerminArt` nur eine aus dem Inhalt abgeleitete
 * Darstellungsfrage (mit oder ohne Ausbildungsthema).
 */
export const TERMIN_TYPEN = ['dienst', 'termin'] as const;

export type TerminTyp = (typeof TERMIN_TYPEN)[number];

export function typName(typ: TerminTyp): string {
  return typ === 'dienst' ? 'Dienst' : 'Termin';
}

export const KATEGORIEN = ['SAN', 'Bt/Vp', 'TeSi/Iuk', 'UF', 'Führung', 'Sonstiges'] as const;

export type Kategorie = (typeof KATEGORIEN)[number];

/** Nachweis-/Pflichtspalten des Jahresplans (Spalten K–T der Excel-Vorlage). */
export const NACHWEISE = [
  { key: 'stvo', header: '§35/38 StVO', kurz: '§35/38' },
  { key: 'elektro', header: 'Elektrosicherheitsunterweisung', kurz: 'Elektro' },
  { key: 'gas', header: 'Gas', kurz: 'Gas' },
  { key: 'ifsg', header: 'IfSG Folge', kurz: 'IfSG' },
  { key: 'fsKontrolle', header: 'FS-Kontrolle', kurz: 'FS-Kontrolle' },
  { key: 'aed', header: 'AED Einw.', kurz: 'AED' },
  { key: 'bls', header: 'BLS', kurz: 'BLS' },
  { key: 'fahreinweisung', header: 'Fahreinweisung JUH', kurz: 'Fahreinweisung' },
  { key: 'ufSitzung', header: 'UF Sitzung', kurz: 'UF-Sitzung' },
  { key: 'gesellschaft', header: 'Gesellschaft', kurz: 'Gesellschaft' },
] as const;

export type NachweisKey = (typeof NACHWEISE)[number]['key'];

export const NACHWEIS_KEYS: readonly NachweisKey[] = NACHWEISE.map((n) => n.key);

/**
 * Ein Eintrag des Plans. Ein Termin mit `datum === null` liegt im Backlog
 * ("Offene Ideen") – dadurch nutzen Jahresplan und Backlog dasselbe Schema.
 */
export interface Termin {
  id: string;
  /** ISO-Datum `YYYY-MM-DD`, oder `null` für Backlog-Einträge. */
  datum: string | null;
  /**
   * Letzter Kalendertag eines mehrtägigen Termins (einschließlich), sonst `null`.
   * Immer entweder `null` oder `>= datum`; ein Backlog-Eintrag hat kein Enddatum.
   */
  datumBis: string | null;
  /** Ortszeit `HH:MM`, leer wenn der Eintrag ohne Uhrzeit geführt wird. */
  beginnZeit: string;
  endeZeit: string;
  /** Dienst oder sonstiger Termin – siehe `TerminTyp`. */
  typ: TerminTyp;
  /** Freitext-Hinweis (Feiertag, Veranstaltung, Dienstabend-Bezug …). */
  hinweis: string;
  kategorie: Kategorie | '';
  thema: string;
  ausbilder: string;
  /** Verweis in die eigene KatS-A-Plan-Themenliste. */
  katsThemaId: string | null;
  /** Originaltitel aus der Excel-Spalte "KatS-A-plan Titel" (Fallback ohne Verweis). */
  katsTitel: string;
  /** Spalte "KatS-A-plan Bezug" – Pflichtthema nach KatS-Ausbildungsplan. */
  katsPflicht: boolean;
  hgmInhalt: string;
  hgmTitel: string;
  nachweise: NachweisKey[];
  material: string;
  anforderungen: string;
  notizen: string;
}

export interface KatsThema {
  id: string;
  /** Gliederungsnummer im KatS-Ausbildungsplan, z. B. "2.4". */
  nummer: string;
  titel: string;
  beschreibung: string;
  /** Pflichtthema – fließt in die Abdeckungsauswertung ein. */
  pflicht: boolean;
}

export interface PlanDocument {
  jahr: number;
  /** Überschrift des Jahresplan-Blattes, z. B. "(Jahres)Dienstplan BI EE 04". */
  titel: string;
  termine: Termin[];
  backlog: Termin[];
  katsThemen: KatsThema[];
}

/**
 * Ein Jahresblatt der Arbeitsmappe: Blattname ist die Jahreszahl, eigene
 * Termine und eine eigene KatS-A-Plan-Themenliste je Jahr.
 */
export interface Jahresblatt {
  jahr: number;
  titel: string;
  termine: Termin[];
  katsThemen: KatsThema[];
}

/**
 * Gesamte Arbeitsmappe: ein Jahresblatt je Jahr, dazu das geteilte
 * Ideen-Backlog ("Offene Ideen"), das jahresübergreifend ein einziges Mal existiert.
 */
export interface Arbeitsmappe {
  jahre: Jahresblatt[];
  backlog: Termin[];
}

export function leeresJahresblatt(jahr: number): Jahresblatt {
  return { jahr, titel: `Jahresplan ${jahr}`, termine: [], katsThemen: [] };
}

/** Blendet das Backlog in ein Jahresblatt ein – die Sicht, mit der der Store arbeitet. */
export function alsPlanDocument(blatt: Jahresblatt, backlog: Termin[]): PlanDocument {
  return {
    jahr: blatt.jahr,
    titel: blatt.titel,
    termine: blatt.termine,
    katsThemen: blatt.katsThemen,
    backlog,
  };
}

/** Blendet das Backlog wieder aus – für die Ablage in der Arbeitsmappe. */
export function alsJahresblatt(dokument: PlanDocument): Jahresblatt {
  return {
    jahr: dokument.jahr,
    titel: dokument.titel,
    termine: dokument.termine,
    katsThemen: dokument.katsThemen,
  };
}

/** Einzelnes Dokument als (Übergangs-)Arbeitsmappe mit nur einem Jahresblatt. */
export function einJahrArbeitsmappe(dokument: PlanDocument): Arbeitsmappe {
  return { jahre: [alsJahresblatt(dokument)], backlog: dokument.backlog };
}

/**
 * Abgeleitete Darstellungsform (nicht gespeichert): ein Eintrag ohne Thema und
 * ohne Rolle ist ein reiner Kalendereintrag. Die gepflegte Einordnung Dienst /
 * Termin steht dagegen in `Termin.typ`.
 */
export type TerminArt = 'ausbildung' | 'ereignis';

/** Ein Eintrag ohne Thema und Rolle ist ein reiner Kalendereintrag (Veranstaltung, Feiertag). */
export function terminArt(termin: Termin): TerminArt {
  return termin.thema.trim() || termin.kategorie ? 'ausbildung' : 'ereignis';
}

/** Ein mehrtägiger Termin belegt mehr als einen Kalendertag. */
export function istMehrtaegigerTermin(termin: Termin): boolean {
  return termin.datum !== null && termin.datumBis !== null && termin.datumBis > termin.datum;
}

/**
 * Alle Kalendertage, die der Termin belegt – ein Tag bei eintägigen Terminen,
 * leer bei Backlog-Einträgen. Grundlage für Raster und Balkendarstellung.
 */
export function terminTage(termin: Termin): string[] {
  if (!termin.datum) {
    return [];
  }
  return istMehrtaegigerTermin(termin)
    ? tageVonBis(termin.datum, termin.datumBis!)
    : [termin.datum];
}

export function leererTermin(datum: string | null = null): Termin {
  return {
    id: neueId(),
    datum,
    datumBis: null,
    beginnZeit: '',
    endeZeit: '',
    typ: 'dienst',
    hinweis: '',
    kategorie: '',
    thema: '',
    ausbilder: '',
    katsThemaId: null,
    katsTitel: '',
    katsPflicht: false,
    hgmInhalt: '',
    hgmTitel: '',
    nachweise: [],
    material: '',
    anforderungen: '',
    notizen: '',
  };
}

export function leeresDocument(jahr = new Date().getFullYear()): PlanDocument {
  return { jahr, titel: `Jahresplan ${jahr}`, termine: [], backlog: [], katsThemen: [] };
}

export function neueId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
