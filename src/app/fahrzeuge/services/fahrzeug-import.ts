import { leseCsv, schreibeCsv } from '../../kern/text/csv';
import {
  Eigentuemer,
  Fahrzeugstamm,
  GRUPPE_STANDARD,
  Wartungstermin,
} from '../models/fahrzeug.model';
import { EIGENTUEMER_LABEL } from './eigentuemer-label';
import { normalisiereKennzeichen } from './kennzeichen';
import { istEigentuemer, istGueltigeFin, istIsoDatum } from './fahrzeug-pruefung';

/**
 * Stammdatenimport aus einer CSV-Datei. Reine Funktionen ohne Angular- oder
 * HTTP-Bezug: das Lesen und Bewerten der Datei ist unabhängig davon, wie die
 * Fahrzeuge anschließend angelegt werden (siehe `fahrzeug-import-store.service.ts`).
 *
 * Pflichtspalten sind Bezeichnung und Kennzeichen – dieselben Felder, die schon
 * das Formular verlangt. Bei Prüfterminen wird ausschließlich die HU
 * unterstützt; weitere Wartungstermine bleiben der Detailseite vorbehalten.
 *
 * Ein Kennzeichen wird nur einmalig importiert: jede weitere Zeile mit
 * demselben Kennzeichen wird abgewiesen, nie zusammengeführt oder überschrieben.
 */

/** Vorlauf in Tagen, wenn die Datei keinen eigenen Wert nennt (Konzeptvorgabe). */
export const VORGABE_ERINNERUNG_TAGE = 30;

const SPALTE_BEZEICHNUNG = 'bezeichnung';
const SPALTE_KENNZEICHEN = 'kennzeichen';

/** Erlaubte Schreibweisen je Spalte; der erste Eintrag ist der Name in der Vorlage. */
const SPALTEN_ALIASE: Readonly<Record<string, readonly string[]>> = {
  bezeichnung: ['bezeichnung'],
  kennzeichen: ['kennzeichen'],
  funkrufname: ['funkrufname'],
  fahrgestellnummer: ['fahrgestellnummer', 'fin'],
  eigentuemer: ['eigentuemer', 'eigentümer'],
  bemerkung: ['bemerkung'],
  hu_faellig: ['hu_faellig', 'hu_fällig', 'hu'],
  hu_erinnerung_tage: ['hu_erinnerung_tage', 'hu_erinnerung'],
};

const PFLICHTSPALTEN: readonly string[] = [SPALTE_BEZEICHNUNG, SPALTE_KENNZEICHEN];

/** Reihenfolge der Spalten in Vorlage und Bericht. */
const VORLAGE_SPALTEN: readonly string[] = [
  'bezeichnung',
  'kennzeichen',
  'funkrufname',
  'fahrgestellnummer',
  'eigentuemer',
  'bemerkung',
  'hu_faellig',
  'hu_erinnerung_tage',
];

export type ImportBefund = 'uebernehmen' | 'fehler' | 'dublette-datei' | 'dublette-bestand';

export interface ImportZeile {
  /** Zeilennummer in der Datei; die Kopfzeile ist Zeile 1. */
  zeilennummer: number;
  /** Kennzeichen in der Schreibweise der Datei, für die Anzeige. */
  kennzeichen: string;
  bezeichnung: string;
  /** Fertiges Fahrzeug, sofern die Zeile übernommen werden kann. */
  fahrzeug: Fahrzeugstamm | null;
  befund: ImportBefund;
  /** Gründe für Abweisung oder Hinweise zu Vorgabewerten. */
  meldungen: string[];
}

export interface ImportVorschau {
  /** Fehlende Pflichtspalten – solange gesetzt, ist der gesamte Import gesperrt. */
  spaltenfehler: string[];
  /** Unkritische Hinweise, etwa zu unbekannten Spalten. */
  hinweise: string[];
  zeilen: ImportZeile[];
}

function eigentuemerAusText(wert: string): Eigentuemer | null {
  const getrimmt = wert.trim();
  if (getrimmt === '') return 'organisation';
  const klein = getrimmt.toLowerCase();
  if (istEigentuemer(klein)) return klein;
  for (const [schluessel, label] of Object.entries(EIGENTUEMER_LABEL)) {
    if (label.toLowerCase() === klein && istEigentuemer(schluessel)) return schluessel;
  }
  return null;
}

/** Akzeptiert `YYYY-MM-DD` und das im Prüfbericht übliche `TT.MM.JJJJ`. */
function isoDatumAusText(wert: string): string | null {
  const getrimmt = wert.trim();
  if (istIsoDatum(getrimmt)) return getrimmt;
  const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(getrimmt);
  if (!deutsch) return null;
  const [, tag, monat, jahr] = deutsch;
  const iso = `${jahr}-${monat.padStart(2, '0')}-${tag.padStart(2, '0')}`;
  return istIsoDatum(iso) ? iso : null;
}

interface SpaltenAbbildung {
  /** Spaltenname → Index in der Datenzeile. */
  index: Map<string, number>;
  fehlend: string[];
  unbekannt: string[];
}

function bildeSpaltenAb(kopf: readonly string[]): SpaltenAbbildung {
  const index = new Map<string, number>();
  const erkannt = new Set<number>();
  for (const [name, aliase] of Object.entries(SPALTEN_ALIASE)) {
    const gefunden = kopf.findIndex((spalte) => aliase.includes(spalte));
    if (gefunden >= 0) {
      index.set(name, gefunden);
      erkannt.add(gefunden);
    }
  }
  return {
    index,
    fehlend: PFLICHTSPALTEN.filter((name) => !index.has(name)),
    unbekannt: kopf.filter((spalte, i) => spalte !== '' && !erkannt.has(i)),
  };
}

function feld(zeile: readonly string[], abbildung: SpaltenAbbildung, name: string): string {
  const i = abbildung.index.get(name);
  return i === undefined ? '' : (zeile[i] ?? '').trim();
}

function baueWartungstermin(faelligAm: string, erinnerungTage: number): Wartungstermin {
  return {
    id: crypto.randomUUID(),
    art: 'hu',
    bezeichnung: 'Hauptuntersuchung',
    faelligAm,
    erinnerungTage,
    erledigtAm: null,
  };
}

interface ZeilenErgebnis {
  fahrzeug: Fahrzeugstamm | null;
  /** Gründe, die die Zeile abweisen. */
  fehler: string[];
  /** Hinweise zu Vorgabewerten; sie weisen die Zeile nicht ab. */
  hinweise: string[];
}

function baueFahrzeug(zeile: readonly string[], abbildung: SpaltenAbbildung): ZeilenErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const bezeichnung = feld(zeile, abbildung, 'bezeichnung');
  const kennzeichen = feld(zeile, abbildung, 'kennzeichen');
  if (bezeichnung === '') fehler.push('Bezeichnung fehlt.');
  if (kennzeichen === '') fehler.push('Kennzeichen fehlt.');

  const finRoh = feld(zeile, abbildung, 'fahrgestellnummer');
  let fahrgestellnummer: string | null = null;
  if (finRoh !== '') {
    if (istGueltigeFin(finRoh)) {
      fahrgestellnummer = finRoh.toUpperCase();
    } else {
      fehler.push('Fahrgestellnummer ist keine gültige FIN (17 Zeichen, ohne I, O und Q).');
    }
  }

  const eigentuemerRoh = feld(zeile, abbildung, 'eigentuemer');
  const eigentuemer = eigentuemerAusText(eigentuemerRoh);
  if (eigentuemer === null) {
    fehler.push(`Eigentümer „${eigentuemerRoh}" ist unbekannt (Land NRW, Bund, Organisation).`);
  } else if (eigentuemerRoh === '') {
    hinweise.push('Ohne Eigentümer übernommen: Organisation, damit ohne Mindestlaufleistung.');
  }

  const wartungstermine: Wartungstermin[] = [];
  const huRoh = feld(zeile, abbildung, 'hu_faellig');
  const erinnerungRoh = feld(zeile, abbildung, 'hu_erinnerung_tage');
  let erinnerungTage = VORGABE_ERINNERUNG_TAGE;
  if (erinnerungRoh !== '') {
    const zahl = Number(erinnerungRoh);
    if (!Number.isInteger(zahl) || zahl < 0) {
      fehler.push('Erinnerung in Tagen muss eine ganze Zahl ab 0 sein.');
    } else {
      erinnerungTage = zahl;
    }
  }
  if (huRoh !== '') {
    const faelligAm = isoDatumAusText(huRoh);
    if (faelligAm === null) {
      fehler.push(`HU-Fälligkeit „${huRoh}" ist kein Datum (JJJJ-MM-TT oder TT.MM.JJJJ).`);
    } else {
      wartungstermine.push(baueWartungstermin(faelligAm, erinnerungTage));
    }
  } else if (erinnerungRoh !== '') {
    hinweise.push('Erinnerung ohne HU-Fälligkeit bleibt ohne Wirkung.');
  }

  if (fehler.length > 0 || eigentuemer === null) {
    return { fahrzeug: null, fehler, hinweise };
  }
  return {
    fahrzeug: {
      id: crypto.randomUUID(),
      bezeichnung,
      funkrufname: feld(zeile, abbildung, 'funkrufname'),
      kennzeichen,
      fahrgestellnummer,
      eigentuemer,
      // Der Import kennt keine Gruppenspalte; neue Fahrzeuge starten wie im
      // Formular mit dem Standardwert und lassen sich danach zuordnen.
      gruppe: GRUPPE_STANDARD,
      bemerkung: feld(zeile, abbildung, 'bemerkung'),
      wartungstermine,
      // Beide Felder setzt der Worker aus der geprüften Anmeldung neu; die
      // Werte hier erfüllen nur den Domänentyp.
      geaendertAm: new Date().toISOString(),
      geaendertVon: '',
    },
    fehler,
    hinweise,
  };
}

/**
 * Liest eine CSV-Datei und bewertet jede Zeile gegen die bereits vorhandenen
 * Kennzeichen. `vorhandene` enthält normalisierte Kennzeichen aus dem Bestand.
 */
export function leseFahrzeugImport(text: string, vorhandene: ReadonlySet<string>): ImportVorschau {
  const tabelle = leseCsv(text);
  if (tabelle.kopf.length === 0) {
    return { spaltenfehler: ['Die Datei ist leer.'], hinweise: [], zeilen: [] };
  }
  const abbildung = bildeSpaltenAb(tabelle.kopf);
  const spaltenfehler = abbildung.fehlend.map(
    (name) => `Pflichtspalte „${name}" fehlt in der Kopfzeile.`,
  );
  const hinweise =
    abbildung.unbekannt.length > 0
      ? [`Unbekannte Spalten werden übergangen: ${abbildung.unbekannt.join(', ')}.`]
      : [];
  if (spaltenfehler.length > 0) {
    return { spaltenfehler, hinweise, zeilen: [] };
  }
  if (tabelle.zeilen.length === 0) {
    return {
      spaltenfehler: ['Die Datei enthält außer der Kopfzeile keine Zeilen.'],
      hinweise,
      zeilen: [],
    };
  }

  const inDatei = new Set<string>();
  const zeilen = tabelle.zeilen.map((werte, i) => {
    const ergebnis = baueFahrzeug(werte, abbildung);
    const kennzeichen = feld(werte, abbildung, 'kennzeichen');
    const normalisiert = normalisiereKennzeichen(kennzeichen);
    const meldungen = [...ergebnis.fehler, ...ergebnis.hinweise];
    let befund: ImportBefund = ergebnis.fahrzeug === null ? 'fehler' : 'uebernehmen';
    if (befund === 'uebernehmen' && vorhandene.has(normalisiert)) {
      befund = 'dublette-bestand';
      meldungen.push('Zu diesem Kennzeichen ist bereits ein Fahrzeug angelegt.');
    } else if (befund === 'uebernehmen' && inDatei.has(normalisiert)) {
      befund = 'dublette-datei';
      meldungen.push('Dieses Kennzeichen kommt in der Datei mehrfach vor.');
    }
    if (befund === 'uebernehmen') inDatei.add(normalisiert);
    return {
      zeilennummer: i + 2,
      kennzeichen,
      bezeichnung: feld(werte, abbildung, 'bezeichnung'),
      fahrzeug: befund === 'uebernehmen' ? ergebnis.fahrzeug : null,
      befund,
      meldungen,
    };
  });
  return { spaltenfehler: [], hinweise, zeilen };
}

/** Mustervorlage zum Herunterladen: Kopfzeile plus zwei erfundene Beispielzeilen. */
export function vorlageCsv(): string {
  return schreibeCsv(VORLAGE_SPALTEN, [
    ['MTW 1', 'XY-TE 123', 'Florian Testort 1/19/1', '', 'Organisation', '', '2027-04-30', '30'],
    ['GW-San', 'XY-TE 456', 'Florian Testort 1/51/1', '', 'Land NRW', 'Beispielzeile', '', ''],
  ]);
}

/** Ergebnis einer einzelnen angelegten oder abgewiesenen Zeile. */
export interface ImportErgebnis {
  zeilennummer: number;
  kennzeichen: string;
  bezeichnung: string;
  angelegt: boolean;
  grund: string;
}

/** Bericht über einen abgeschlossenen Lauf, zum Herunterladen als CSV. */
export function berichtCsv(ergebnisse: readonly ImportErgebnis[]): string {
  return schreibeCsv(
    ['zeile', 'kennzeichen', 'bezeichnung', 'ergebnis', 'grund'],
    ergebnisse.map((eintrag) => [
      String(eintrag.zeilennummer),
      eintrag.kennzeichen,
      eintrag.bezeichnung,
      eintrag.angelegt ? 'angelegt' : 'abgewiesen',
      eintrag.grund,
    ]),
  );
}

export const BEFUND_LABEL: Readonly<Record<ImportBefund, string>> = {
  uebernehmen: 'wird angelegt',
  fehler: 'fehlerhaft',
  'dublette-datei': 'doppelt in der Datei',
  'dublette-bestand': 'bereits vorhanden',
};
