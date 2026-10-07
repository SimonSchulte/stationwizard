import { formatiereDatum, heuteIso } from '../../kern/kalender/datum';

/**
 * Fachregeln der Ehrungen. Gespeichert wird nur, was erfasst oder importiert
 * wurde (Stunden, Eintrittsdatum, „Besondere Verdienste", bereits erhaltene
 * Auszeichnungen); was fällig ist, wird hier jedes Mal berechnet.
 *
 * Die Schwellen der Leistungsabzeichen und Ehrenzeichen stammen aus den
 * Formeln der Arbeitstabelle „Ehrungen 2026" (jeweils echt größer), die der
 * Jubiläumszeichen (25/40/50/60 Jahre, ab erreicht) aus der Vorgabe des
 * Betreibers. Die Schlüsselliste und `personSchluessel()` stehen
 * gegengleich in `worker/src/ehrungen.ts`; beide gemeinsam ändern.
 */
export const EHRUNG_SCHLUESSEL = [
  'bronze',
  'silber',
  'gold',
  'jubilaeum-25',
  'jubilaeum-40',
  'jubilaeum-50',
  'jubilaeum-60',
  'uhr-30',
  'uhr-40',
  'uhr-50',
  'ehrenzeichen',
  'ehrenzeichen-bande',
  'ehrennadel',
] as const;

export type EhrungSchluessel = (typeof EHRUNG_SCHLUESSEL)[number];

export const EHRUNG_BEZEICHNUNG: Readonly<Record<EhrungSchluessel, string>> = {
  bronze: 'Bronze',
  silber: 'Silber',
  gold: 'Gold',
  'jubilaeum-25': '25 Jahre',
  'jubilaeum-40': '40 Jahre',
  'jubilaeum-50': '50 Jahre',
  'jubilaeum-60': '60 Jahre',
  'uhr-30': 'Jubiläumsuhr 30 Jahre',
  'uhr-40': 'Jubiläumsuhr 40 Jahre',
  'uhr-50': 'Jubiläumsuhr 50 Jahre',
  ehrenzeichen: 'Ehrenzeichen',
  'ehrenzeichen-bande': 'Ehrenzeichen am Bande',
  ehrennadel: 'Ehrennadel am Band des Johanniterordens',
};

/** Kurzbeschriftung für Chips und Feldnamen. */
export const EHRUNG_KURZ: Readonly<Record<EhrungSchluessel, string>> = {
  bronze: 'Bronze',
  silber: 'Silber',
  gold: 'Gold',
  'jubilaeum-25': '25 Jahre',
  'jubilaeum-40': '40 Jahre',
  'jubilaeum-50': '50 Jahre',
  'jubilaeum-60': '60 Jahre',
  'uhr-30': '30 Jahre',
  'uhr-40': '40 Jahre',
  'uhr-50': '50 Jahre',
  ehrenzeichen: 'Ehrenzeichen',
  'ehrenzeichen-bande': 'Am Bande',
  ehrennadel: 'Ehrennadel',
};

/**
 * Erhaltene Auszeichnungen mit dem Jahr der Vergabe; `null` heißt „erhalten,
 * Jahr unbekannt“. Eine nicht vorhandene Eigenschaft heißt „nicht erhalten“.
 */
export type Erhalten = Partial<Record<EhrungSchluessel, number | null>>;

export const VERGABEJAHR_MINIMUM = 1900;
export const VERGABEJAHR_MAXIMUM = 2200;

export function hatErhalten(erhalten: Erhalten, schluessel: EhrungSchluessel): boolean {
  return Object.hasOwn(erhalten, schluessel);
}

export const LEISTUNGSABZEICHEN: readonly EhrungSchluessel[] = ['bronze', 'silber', 'gold'];
export const JUBILAEUMSZEICHEN: readonly EhrungSchluessel[] = [
  'jubilaeum-25',
  'jubilaeum-40',
  'jubilaeum-50',
  'jubilaeum-60',
];
export const JUBILAEUMSUHREN: readonly EhrungSchluessel[] = ['uhr-30', 'uhr-40', 'uhr-50'];
export const EHRENZEICHEN: readonly EhrungSchluessel[] = [
  'ehrenzeichen',
  'ehrenzeichen-bande',
  'ehrennadel',
];

/**
 * Auszeichnungen, die nur der Reihe nach vergeben werden: Silber erst nach Bronze, Gold erst nach
 * Silber, Ehrenzeichen am Bande erst nach dem Ehrenzeichen, die Ehrennadel erst nach dem Band.
 * Jubiläumszeichen und Jubiläumsuhr bilden keine Staffel.
 */
export const STAFFELN: readonly (readonly EhrungSchluessel[])[] = [
  LEISTUNGSABZEICHEN,
  EHRENZEICHEN,
];

export function staffelVon(schluessel: EhrungSchluessel): readonly EhrungSchluessel[] | null {
  return STAFFELN.find((staffel) => staffel.includes(schluessel)) ?? null;
}

export function vorstufe(schluessel: EhrungSchluessel): EhrungSchluessel | null {
  const staffel = staffelVon(schluessel);
  const index = staffel ? staffel.indexOf(schluessel) : -1;
  return staffel && index > 0 ? (staffel[index - 1] ?? null) : null;
}

export function nachstufe(schluessel: EhrungSchluessel): EhrungSchluessel | null {
  const staffel = staffelVon(schluessel);
  return staffel ? (staffel[staffel.indexOf(schluessel) + 1] ?? null) : null;
}

export interface Reihenfolgeproblem {
  /** Höchste erhaltene Auszeichnung der Staffel. */
  vorhanden: EhrungSchluessel;
  /** Vorstufen, die dazu nicht als erhalten erfasst sind. */
  fehlend: EhrungSchluessel[];
}

/** Erhaltenes ohne die zugehörigen Vorstufen, etwa Gold ohne Silber. */
export function reihenfolgeProbleme(
  erhalten: Erhalten,
  staffeln: readonly (readonly EhrungSchluessel[])[] = STAFFELN,
): Reihenfolgeproblem[] {
  const probleme: Reihenfolgeproblem[] = [];
  for (const staffel of staffeln) {
    const hoechste = [...staffel].reverse().find((schluessel) => hatErhalten(erhalten, schluessel));
    if (!hoechste) continue;
    const fehlend = staffel
      .slice(0, staffel.indexOf(hoechste))
      .filter((schluessel) => !hatErhalten(erhalten, schluessel));
    if (fehlend.length > 0) probleme.push({ vorhanden: hoechste, fehlend });
  }
  return probleme;
}

export interface EhrungPerson {
  id: string;
  nachname: string;
  vorname: string;
  /** Wirksame Stunden: die größere Zahl aus Import und manuellem Nachtrag. */
  stunden: number;
  /** Stand der letzten Stundenliste (Import). */
  stundenImport: number;
  /** Von Hand nachgetragen; `null`, wenn nichts nachgetragen ist. */
  stundenManuell: number | null;
  /** Jahr, für das der manuelle Nachtrag gilt; gehört zwingend zu jedem Nachtrag. */
  stundenManuellStand: number | null;
  /** `JJJJ-MM-TT` oder `null`. */
  eintrittsdatum: string | null;
  besondereVerdienste: boolean;
  erhalten: Erhalten;
  version: number;
  geaendertAm: string;
  geaendertVon: string;
}

/** Für alle Berechnungen zählt die größere der beiden Zahlen. */
export function wirksameStunden(importiert: number, manuell: number | null): number {
  return Math.max(importiert, manuell ?? 0);
}

/** Vergleichsform für den Namensabgleich; Gegenstück in `worker/src/ehrungen.ts`. */
export function personSchluessel(nachname: string, vorname: string): string {
  const glatt = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${glatt(nachname)}|${glatt(vorname)}`;
}

/** Höchstes durch die Stunden erreichtes Leistungsabzeichen (>1000/>2000/>4000 Stunden). */
export function leistungsabzeichenErfuellt(stunden: number): EhrungSchluessel | null {
  if (stunden > 4000) return 'gold';
  if (stunden > 2000) return 'silber';
  if (stunden > 1000) return 'bronze';
  return null;
}

export type LeistungAbgleich = 'passt' | 'fehlt' | 'zuviel' | 'reihenfolge';

/**
 * Vergleicht das höchste als erhalten angehakte Leistungsabzeichen mit dem Anspruch aus den
 * Stunden: `fehlt`, wenn weniger angehakt ist als zusteht, `zuviel`, wenn mehr angehakt ist, als
 * die Stunden hergeben (etwa veraltete Stunden oder ein Tippfehler); `reihenfolge`, wenn eine
 * höhere Stufe ohne ihre Vorstufen erfasst ist (Gold ohne Silber).
 */
export function leistungAbgleich(stunden: number, erhalten: Erhalten): LeistungAbgleich {
  if (reihenfolgeProbleme(erhalten, [LEISTUNGSABZEICHEN]).length > 0) return 'reihenfolge';
  const rang = (schluessel: EhrungSchluessel | null) =>
    schluessel ? LEISTUNGSABZEICHEN.indexOf(schluessel) : -1;
  const hoechsteErhalten = [...LEISTUNGSABZEICHEN]
    .reverse()
    .find((schluessel) => hatErhalten(erhalten, schluessel));
  const unterschied = rang(hoechsteErhalten ?? null) - rang(leistungsabzeichenErfuellt(stunden));
  return unterschied === 0 ? 'passt' : unterschied < 0 ? 'fehlt' : 'zuviel';
}

/** Mitgliedsjahre als Unterschied der Kalenderjahre, wie `YEAR(TODAY()) - YEAR(C)` der Tabelle. */
export function mitgliedsjahre(eintrittsdatum: string | null, jahr: number): number | null {
  if (!eintrittsdatum || !/^\d{4}-\d{2}-\d{2}$/.test(eintrittsdatum)) return null;
  return jahr - Number(eintrittsdatum.slice(0, 4));
}

/** Höchstes erreichte Jubiläum (ab 25, 40, 50, 60 Jahren). */
export function jubilaeumErfuellt(jahre: number | null): EhrungSchluessel | null {
  if (jahre === null) return null;
  if (jahre >= 60) return 'jubilaeum-60';
  if (jahre >= 50) return 'jubilaeum-50';
  if (jahre >= 40) return 'jubilaeum-40';
  if (jahre >= 25) return 'jubilaeum-25';
  return null;
}

/**
 * Jubiläumsuhr: 30, 40 und 50 Jahre ununterbrochene aktive Tätigkeit, ab erreicht. Gerechnet wird
 * aus dem Eintrittsdatum; Unterbrechungen der Tätigkeit sind nicht erfasst und werden nicht geprüft.
 */
export function uhrErfuellt(jahre: number | null): EhrungSchluessel | null {
  if (jahre === null) return null;
  if (jahre >= 50) return 'uhr-50';
  if (jahre >= 40) return 'uhr-40';
  if (jahre >= 30) return 'uhr-30';
  return null;
}

export type UhrArt = 'Damen' | 'Herren';

/**
 * Damen- oder Herrenuhr nach der HiOrg-Anrede; `null`, wenn die Anrede fehlt oder nicht eindeutig
 * ist. Die tatsächlich in HiOrg verwendeten Werte sind nicht belegt – unbekannte Werte führen
 * deshalb zu `null` statt zu einer Vermutung.
 */
export function uhrArtAusAnrede(anrede: string | undefined): UhrArt | null {
  const text = anrede?.trim().toLocaleLowerCase('de') ?? '';
  if (/^(frau|fr\.?|weiblich|w)$/.test(text)) return 'Damen';
  if (/^(herr|herrn|hr\.?|männlich|maennlich|m)$/.test(text)) return 'Herren';
  return null;
}

/** Ehrennadel: so viele Jahre nach der Verleihung des Ehrenzeichens am Bande. */
export const EHRENNADEL_WARTEZEIT_JAHRE = 12;

/**
 * Nur bei „Besondere Verdienste“ und vorhandenem Eintrittsdatum:
 * - Ehrenzeichen ab 4 Dienstjahren,
 * - Ehrenzeichen am Bande ab 6 Dienstjahren,
 * - Ehrennadel mit Band des Johanniterordens 12 Jahre nach Verleihung des Ehrenzeichens am Bande.
 * Für die Ehrennadel muss das Ehrenzeichen am Bande mit Vergabejahr erfasst sein; ohne dieses Jahr
 * lässt sich die Wartezeit nicht prüfen, die Ehrennadel gilt dann nicht als erreicht.
 */
export function ehrenzeichenErfuellt(
  besondereVerdienste: boolean,
  jahre: number | null,
  erhalten: Erhalten = {},
  jahr: number = aktuellesJahr(),
): EhrungSchluessel | null {
  if (!besondereVerdienste || jahre === null) return null;
  const bandeJahr = erhalten['ehrenzeichen-bande'];
  if (typeof bandeJahr === 'number' && jahr - bandeJahr >= EHRENNADEL_WARTEZEIT_JAHRE) {
    return 'ehrennadel';
  }
  if (jahre >= 6) return 'ehrenzeichen-bande';
  if (jahre >= 4) return 'ehrenzeichen';
  return null;
}

export interface Anspruch {
  /** Höchste nach den Daten zustehende Auszeichnung der Gruppe. */
  erfuellt: EhrungSchluessel | null;
  /**
   * Noch zu vergebende Stufen bis einschließlich `erfuellt`, in Vergabereihenfolge. Bei einer
   * Staffel zählen nur Stufen oberhalb der höchsten erhaltenen; Lücken darunter sind ein
   * Reihenfolgeproblem, keine fällige Ehrung.
   */
  offen: EhrungSchluessel[];
  /** Die Stufe, die jetzt vergeben werden kann: die erste offene. */
  naechste: EhrungSchluessel | null;
  /** Irgendetwas ist offen. */
  faellig: boolean;
}

export interface Ansprueche {
  leistung: Anspruch;
  jubilaeum: Anspruch;
  uhr: Anspruch;
  ehrenzeichen: Anspruch;
}

function anspruch(
  erfuellt: EhrungSchluessel | null,
  erhalten: Erhalten,
  staffel: readonly EhrungSchluessel[] | null = null,
): Anspruch {
  if (!erfuellt) return { erfuellt: null, offen: [], naechste: null, faellig: false };
  let offen: EhrungSchluessel[];
  if (staffel) {
    const hoechste = staffel.reduce(
      (stand, schluessel, index) => (hatErhalten(erhalten, schluessel) ? index : stand),
      -1,
    );
    offen = staffel
      .slice(0, staffel.indexOf(erfuellt) + 1)
      .filter((schluessel, index) => index > hoechste && !hatErhalten(erhalten, schluessel));
  } else {
    offen = hatErhalten(erhalten, erfuellt) ? [] : [erfuellt];
  }
  return { erfuellt, offen, naechste: offen[0] ?? null, faellig: offen.length > 0 };
}

export function ansprueche(
  person: Pick<EhrungPerson, 'stunden' | 'eintrittsdatum' | 'besondereVerdienste' | 'erhalten'>,
  jahr: number = aktuellesJahr(),
): Ansprueche {
  const jahre = mitgliedsjahre(person.eintrittsdatum, jahr);
  return {
    leistung: anspruch(
      leistungsabzeichenErfuellt(person.stunden),
      person.erhalten,
      LEISTUNGSABZEICHEN,
    ),
    jubilaeum: anspruch(jubilaeumErfuellt(jahre), person.erhalten),
    uhr: anspruch(uhrErfuellt(jahre), person.erhalten),
    ehrenzeichen: anspruch(
      ehrenzeichenErfuellt(person.besondereVerdienste, jahre, person.erhalten, jahr),
      person.erhalten,
      EHRENZEICHEN,
    ),
  };
}

export interface ZuEhrender {
  nachname: string;
  vorname: string;
  gruppe: 'Leistungsabzeichen' | 'Jubiläumszeichen' | 'Jubiläumsuhr' | 'Ehrenzeichen';
  /** Die Stufe, die jetzt vergeben werden kann. */
  auszeichnung: EhrungSchluessel;
  /** Höchste zustehende Stufe; höher als `auszeichnung`, wenn zuerst Vorstufen zu vergeben sind. */
  anspruchBis: EhrungSchluessel;
  /** Warnungen zu Staffel und Reihenfolge, leer wenn alles stimmig ist. */
  hinweis: string;
  /** Woraus sich der Anspruch ergibt, zum Nachlesen auf der Liste. */
  grundlage: string;
  /** Bereits erhaltene Auszeichnungen derselben Gruppe, etwa „Bronze 2012“. */
  bisher: string;
}

/**
 * Warnungen zu einer Gruppe: der Anspruch geht über die jetzt vergebbare Stufe hinaus (Silber
 * steht zu, aber erst Bronze kann vergeben werden) oder Erhaltenes steht ohne Vorstufen da.
 */
export function staffelHinweise(
  erhalten: Erhalten,
  anspruch: Anspruch,
  gruppe: readonly EhrungSchluessel[],
): string[] {
  const hinweise: string[] = [];
  const name = (schluessel: EhrungSchluessel) => EHRUNG_BEZEICHNUNG[schluessel];
  if (anspruch.erfuellt && anspruch.naechste && anspruch.offen.length > 1) {
    hinweise.push(
      `Anspruch bis ${name(anspruch.erfuellt)}, aber zuerst ${name(anspruch.naechste)} vergeben.`,
    );
  }
  for (const problem of reihenfolgeProbleme(erhalten, [gruppe])) {
    hinweise.push(
      `${name(problem.vorhanden)} erfasst, aber ${problem.fehlend.map(name).join(' und ')} fehlt.`,
    );
  }
  return hinweise;
}

export interface Warnung {
  nachname: string;
  vorname: string;
  gruppe: string;
  text: string;
}

/** Alle Warnungen über den Bestand, unabhängig davon, ob gerade etwas zu vergeben ist. */
export function warnungen(
  personen: readonly Pick<
    EhrungPerson,
    'nachname' | 'vorname' | 'stunden' | 'eintrittsdatum' | 'besondereVerdienste' | 'erhalten'
  >[],
  jahr: number = aktuellesJahr(),
): Warnung[] {
  const liste: Warnung[] = [];
  for (const person of personen) {
    const a = ansprueche(person, jahr);
    for (const [gruppe, name, schluessel] of [
      [a.leistung, 'Leistungsabzeichen', LEISTUNGSABZEICHEN],
      [a.ehrenzeichen, 'Ehrenzeichen', EHRENZEICHEN],
    ] as const) {
      for (const text of staffelHinweise(person.erhalten, gruppe, schluessel)) {
        liste.push({ nachname: person.nachname, vorname: person.vorname, gruppe: name, text });
      }
    }
  }
  return liste.sort(
    (x, y) =>
      x.nachname.localeCompare(y.nachname, 'de') || x.vorname.localeCompare(y.vorname, 'de'),
  );
}

/**
 * Alle jetzt zu vergebenden Ehrungen: je Person und Gruppe die nächste vergebbare Stufe. Bei einer
 * Staffel (Bronze → Silber → Gold, Ehrenzeichen → Band → Nadel) ist das die erste noch fehlende
 * Stufe, auch wenn der Anspruch weiter reicht; der Unterschied steht als Hinweis dabei. Sortiert
 * nach Stufe, Nach- und Vorname.
 */
export function zuEhrende(
  personen: readonly Pick<
    EhrungPerson,
    'nachname' | 'vorname' | 'stunden' | 'eintrittsdatum' | 'besondereVerdienste' | 'erhalten'
  >[],
  jahr: number = aktuellesJahr(),
): ZuEhrender[] {
  const gruppen = [
    { name: 'Leistungsabzeichen', schluessel: LEISTUNGSABZEICHEN, art: 'leistung' },
    { name: 'Jubiläumszeichen', schluessel: JUBILAEUMSZEICHEN, art: 'jubilaeum' },
    { name: 'Jubiläumsuhr', schluessel: JUBILAEUMSUHREN, art: 'uhr' },
    { name: 'Ehrenzeichen', schluessel: EHRENZEICHEN, art: 'ehrenzeichen' },
  ] as const;
  const eintraege: ZuEhrender[] = [];
  for (const person of personen) {
    const a = ansprueche(person, jahr);
    const jahre = mitgliedsjahre(person.eintrittsdatum, jahr);
    const seit = person.eintrittsdatum ? formatiereDatum(person.eintrittsdatum) : '';
    for (const gruppe of gruppen) {
      const anspruch = a[gruppe.art];
      if (!anspruch.naechste || !anspruch.erfuellt) continue;
      const grundlage =
        gruppe.art === 'leistung'
          ? `${person.stunden.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Stunden`
          : gruppe.art === 'jubilaeum' || gruppe.art === 'uhr'
            ? `${jahre} Jahre Mitglied (seit ${seit})`
            : `Besondere Verdienste, ${jahre} Jahre Mitglied (seit ${seit})`;
      const bisher = gruppe.schluessel
        .filter((schluessel) => hatErhalten(person.erhalten, schluessel))
        .map((schluessel) => {
          const vergeben = person.erhalten[schluessel];
          return vergeben ? `${EHRUNG_KURZ[schluessel]} ${vergeben}` : EHRUNG_KURZ[schluessel];
        })
        .join(', ');
      eintraege.push({
        nachname: person.nachname,
        vorname: person.vorname,
        gruppe: gruppe.name,
        auszeichnung: anspruch.naechste,
        anspruchBis: anspruch.erfuellt,
        hinweis: staffelHinweise(person.erhalten, anspruch, gruppe.schluessel).join(' '),
        grundlage,
        bisher,
      });
    }
  }
  const rang = (eintrag: ZuEhrender) => EHRUNG_SCHLUESSEL.indexOf(eintrag.auszeichnung);
  return eintraege.sort(
    (a, b) =>
      rang(a) - rang(b) ||
      a.nachname.localeCompare(b.nachname, 'de') ||
      a.vorname.localeCompare(b.vorname, 'de'),
  );
}

export function aktuellesJahr(): number {
  return Number(heuteIso().slice(0, 4));
}

/* -------------------------------------------------------------------- */
/* Textimport „Nachname, Vorname 6.546,98"                               */
/* -------------------------------------------------------------------- */

export interface StundenEintrag {
  nachname: string;
  vorname: string;
  stunden: number;
}

export interface StundenFehler {
  zeile: number;
  text: string;
  grund: string;
}

/**
 * Liest eine Stundenzahl in deutscher Schreibweise (`6.546,98`). Ein Punkt
 * allein gilt als Dezimalpunkt (`947.62`, wie in der Arbeitstabelle), außer er
 * trennt erkennbar Tausendergruppen (`6.546`).
 */
export function stundenLesen(text: string): number | null {
  const roh = text.trim();
  let normal: string;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(roh)) {
    normal = roh.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(\.\d+)?$/.test(roh)) {
    normal = roh;
  } else if (/^\d+,\d+$/.test(roh)) {
    normal = roh.replace(',', '.');
  } else {
    return null;
  }
  const zahl = Number(normal);
  return Number.isFinite(zahl) ? Math.round(zahl * 100) / 100 : null;
}

/** Eine Person je Zeile: `Nachname, Vorname Stunden` (Tabulator als Trenner genügt ebenso). */
export function stundenTextLesen(text: string): {
  eintraege: StundenEintrag[];
  fehler: StundenFehler[];
} {
  const eintraege: StundenEintrag[] = [];
  const fehler: StundenFehler[] = [];
  const zeilen = text.split(/\r?\n/);
  for (const [index, zeile] of zeilen.entries()) {
    const bereinigt = zeile.trim();
    if (!bereinigt) continue;
    const melde = (grund: string) => fehler.push({ zeile: index + 1, text: bereinigt, grund });
    const treffer = /^(.*\S)[\s\t]+(\S+)$/.exec(bereinigt);
    if (!treffer) {
      melde('Keine Stundenzahl gefunden.');
      continue;
    }
    const stunden = stundenLesen(treffer[2]);
    if (stunden === null) {
      melde('Die Stundenzahl ist nicht lesbar.');
      continue;
    }
    const komma = treffer[1].indexOf(',');
    const nachname = komma < 0 ? '' : treffer[1].slice(0, komma).trim();
    const vorname = komma < 0 ? '' : treffer[1].slice(komma + 1).trim();
    if (!nachname || !vorname) {
      melde('Erwartet wird „Nachname, Vorname“.');
      continue;
    }
    eintraege.push({ nachname, vorname, stunden });
  }
  return { eintraege, fehler };
}

/* -------------------------------------------------------------------- */
/* Prüfung der Worker-Antwort                                            */
/* -------------------------------------------------------------------- */

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

export function istEhrungSchluessel(wert: unknown): wert is EhrungSchluessel {
  return typeof wert === 'string' && (EHRUNG_SCHLUESSEL as readonly string[]).includes(wert);
}

export function istErhalten(wert: unknown): wert is Erhalten {
  return (
    istObjekt(wert) &&
    Object.entries(wert).every(
      ([schluessel, jahr]) =>
        istEhrungSchluessel(schluessel) &&
        (jahr === null ||
          (typeof jahr === 'number' &&
            Number.isInteger(jahr) &&
            jahr >= VERGABEJAHR_MINIMUM &&
            jahr <= VERGABEJAHR_MAXIMUM)),
    )
  );
}

export function istEhrungPerson(wert: unknown): wert is EhrungPerson {
  return (
    istObjekt(wert) &&
    typeof wert['id'] === 'string' &&
    typeof wert['nachname'] === 'string' &&
    typeof wert['vorname'] === 'string' &&
    typeof wert['stunden'] === 'number' &&
    Number.isFinite(wert['stunden']) &&
    typeof wert['stundenImport'] === 'number' &&
    Number.isFinite(wert['stundenImport']) &&
    (wert['stundenManuellStand'] === null ||
      (typeof wert['stundenManuellStand'] === 'number' &&
        Number.isInteger(wert['stundenManuellStand']))) &&
    (wert['stundenManuell'] === null ||
      (typeof wert['stundenManuell'] === 'number' && Number.isFinite(wert['stundenManuell']))) &&
    (wert['eintrittsdatum'] === null ||
      (typeof wert['eintrittsdatum'] === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(wert['eintrittsdatum']))) &&
    typeof wert['besondereVerdienste'] === 'boolean' &&
    istErhalten(wert['erhalten']) &&
    typeof wert['version'] === 'number' &&
    typeof wert['geaendertAm'] === 'string' &&
    typeof wert['geaendertVon'] === 'string'
  );
}
