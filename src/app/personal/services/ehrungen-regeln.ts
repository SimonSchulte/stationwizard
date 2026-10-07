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
export const EHRENZEICHEN: readonly EhrungSchluessel[] = [
  'ehrenzeichen',
  'ehrenzeichen-bande',
  'ehrennadel',
];

export interface EhrungPerson {
  id: string;
  nachname: string;
  vorname: string;
  stunden: number;
  /** `JJJJ-MM-TT` oder `null`. */
  eintrittsdatum: string | null;
  besondereVerdienste: boolean;
  erhalten: Erhalten;
  version: number;
  geaendertAm: string;
  geaendertVon: string;
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

export type LeistungAbgleich = 'passt' | 'fehlt' | 'zuviel';

/**
 * Vergleicht das höchste als erhalten angehakte Leistungsabzeichen mit dem Anspruch aus den
 * Stunden: `fehlt`, wenn weniger angehakt ist als zusteht, `zuviel`, wenn mehr angehakt ist, als
 * die Stunden hergeben (etwa veraltete Stunden oder ein Tippfehler).
 */
export function leistungAbgleich(stunden: number, erhalten: Erhalten): LeistungAbgleich {
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

/** Nur bei „Besondere Verdienste" und vorhandenem Eintrittsdatum (>4/>6/>12 Jahre). */
export function ehrenzeichenErfuellt(
  besondereVerdienste: boolean,
  jahre: number | null,
): EhrungSchluessel | null {
  if (!besondereVerdienste || jahre === null) return null;
  if (jahre > 12) return 'ehrennadel';
  if (jahre > 6) return 'ehrenzeichen-bande';
  if (jahre > 4) return 'ehrenzeichen';
  return null;
}

export interface Anspruch {
  /** Höchste nach den Daten zu vergebende Auszeichnung der Gruppe. */
  erfuellt: EhrungSchluessel | null;
  /** Erfüllt, aber noch nicht als erhalten angehakt. */
  faellig: boolean;
}

export interface Ansprueche {
  leistung: Anspruch;
  jubilaeum: Anspruch;
  ehrenzeichen: Anspruch;
}

function anspruch(erfuellt: EhrungSchluessel | null, erhalten: Erhalten): Anspruch {
  return { erfuellt, faellig: erfuellt !== null && !hatErhalten(erhalten, erfuellt) };
}

export function ansprueche(
  person: Pick<EhrungPerson, 'stunden' | 'eintrittsdatum' | 'besondereVerdienste' | 'erhalten'>,
  jahr: number = aktuellesJahr(),
): Ansprueche {
  const jahre = mitgliedsjahre(person.eintrittsdatum, jahr);
  return {
    leistung: anspruch(leistungsabzeichenErfuellt(person.stunden), person.erhalten),
    jubilaeum: anspruch(jubilaeumErfuellt(jahre), person.erhalten),
    ehrenzeichen: anspruch(
      ehrenzeichenErfuellt(person.besondereVerdienste, jahre),
      person.erhalten,
    ),
  };
}

export interface ZuEhrender {
  nachname: string;
  vorname: string;
  gruppe: 'Leistungsabzeichen' | 'Jubiläumszeichen' | 'Ehrenzeichen';
  auszeichnung: EhrungSchluessel;
  /** Woraus sich der Anspruch ergibt, zum Nachlesen auf der Liste. */
  grundlage: string;
  /** Bereits erhaltene Auszeichnungen derselben Gruppe, etwa „Bronze 2012“. */
  bisher: string;
}

/**
 * Alle noch offenen Ehrungen: je Person und Gruppe die höchste nach den Daten zu vergebende
 * Auszeichnung, sofern sie noch nicht als erhalten angehakt ist. Sortiert nach Gruppe, Stufe,
 * Nach- und Vorname.
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
    { name: 'Ehrenzeichen', schluessel: EHRENZEICHEN, art: 'ehrenzeichen' },
  ] as const;
  const eintraege: ZuEhrender[] = [];
  for (const person of personen) {
    const a = ansprueche(person, jahr);
    const jahre = mitgliedsjahre(person.eintrittsdatum, jahr);
    const seit = person.eintrittsdatum ? formatiereDatum(person.eintrittsdatum) : '';
    for (const gruppe of gruppen) {
      const anspruch = a[gruppe.art];
      if (!anspruch.faellig || !anspruch.erfuellt) continue;
      const grundlage =
        gruppe.art === 'leistung'
          ? `${person.stunden.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Stunden`
          : gruppe.art === 'jubilaeum'
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
        auszeichnung: anspruch.erfuellt,
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
