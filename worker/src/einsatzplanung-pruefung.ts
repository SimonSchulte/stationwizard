import {
  ABSCHNITT_FARBEN,
  ANWEISUNGEN_MAX,
  ANZAHL_MAX,
  FACHGRUPPEN,
  MAX_ABSCHNITTE,
  MAX_LAUFZETTEL,
  MAX_POSITIONEN,
  TEXT_MAX,
} from './einsatzplanung-gemeinsam';
import { istNichtleererText, istObjekt, istText, UUID_REGEX } from './json-lesen';

/**
 * Strikte Prüfung der Einsatzplanung-Eingaben (Datenvertrag, Konzept Abschnitt 9):
 * unbekannte Felder werden abgelehnt, Längen und Mengen begrenzt, Ids innerhalb
 * eines Inhalts eindeutig. Jede Funktion liefert den geprüften Wert oder `null`.
 */

export interface VbPosition {
  id: string;
  herkunftId: string | null;
  anzahl: string;
  material: string;
}
export interface VbLaufzettel {
  id: string;
  herkunftId: string | null;
  ueberschrift: string;
  lagerort: string;
  transportMit: string;
  auftraggeber: string;
  fachgruppe: string | null;
  positionen: VbPosition[];
}
export interface VbAbschnitt {
  id: string;
  herkunftId: string | null;
  titel: string;
  farbe: string;
  fachgruppe: string | null;
  laufzettel: VbLaufzettel[];
}
export interface VbInhalt {
  anweisungen: string;
  abschnitte: VbAbschnitt[];
}
export interface Einsatz {
  id: string;
  titel: string;
  beginn: string | null;
  ende: string | null;
  ort: string | null;
  hiorgVeranstaltungId: string | null;
  pepId: string | null;
}
export interface Vorbereitung {
  vorlageId: string | null;
  vorlageVersion: number | null;
  inhalt: VbInhalt;
}
export interface VbVorlage {
  id: string;
  titel: string;
  inhalt: VbInhalt;
}
export interface VbKennzahlen {
  abschnitte: number;
  laufzettel: number;
  positionen: number;
}

const HIORG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ZEITPUNKT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function hatNurFelder(wert: Record<string, unknown>, erlaubt: readonly string[]): boolean {
  return Object.keys(wert).every((schluessel) => erlaubt.includes(schluessel));
}

function istUuid(wert: unknown): wert is string {
  return typeof wert === 'string' && UUID_REGEX.test(wert);
}

function istUuidOderNull(wert: unknown): wert is string | null {
  return wert === null || istUuid(wert);
}

function istText0bis(wert: unknown, max: number): wert is string {
  return istText(wert) && wert.length <= max;
}

function istFachgruppeOderNull(wert: unknown): wert is string | null {
  return wert === null || (istText(wert) && FACHGRUPPEN.has(wert));
}

export function istZeitpunkt(wert: unknown): wert is string {
  if (!istText(wert)) return false;
  const t = ZEITPUNKT.exec(wert);
  if (!t) return false;
  const [jahr, monat, tag, stunde, minute] = t.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (stunde > 23 || minute > 59) return false;
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  return (
    datum.getUTCFullYear() === jahr &&
    datum.getUTCMonth() === monat - 1 &&
    datum.getUTCDate() === tag
  );
}

function pruefePosition(wert: unknown, ids: Set<string>): VbPosition | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['id', 'herkunftId', 'anzahl', 'material']) ||
    !istUuid(wert['id']) ||
    ids.has(wert['id']) ||
    !istUuidOderNull(wert['herkunftId']) ||
    !istText0bis(wert['anzahl'], ANZAHL_MAX) ||
    !istNichtleererText(wert['material']) ||
    wert['material'].length > TEXT_MAX
  ) {
    return null;
  }
  ids.add(wert['id']);
  return {
    id: wert['id'],
    herkunftId: wert['herkunftId'],
    anzahl: wert['anzahl'],
    material: wert['material'],
  };
}

function pruefeLaufzettel(wert: unknown, ids: Set<string>): VbLaufzettel | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, [
      'id',
      'herkunftId',
      'ueberschrift',
      'lagerort',
      'transportMit',
      'auftraggeber',
      'fachgruppe',
      'positionen',
    ]) ||
    !istUuid(wert['id']) ||
    ids.has(wert['id']) ||
    !istUuidOderNull(wert['herkunftId']) ||
    !istText0bis(wert['ueberschrift'], TEXT_MAX) ||
    !istText0bis(wert['lagerort'], TEXT_MAX) ||
    !istText0bis(wert['transportMit'], TEXT_MAX) ||
    !istText0bis(wert['auftraggeber'], TEXT_MAX) ||
    !istFachgruppeOderNull(wert['fachgruppe']) ||
    !Array.isArray(wert['positionen']) ||
    wert['positionen'].length > MAX_POSITIONEN
  ) {
    return null;
  }
  ids.add(wert['id']);
  const positionen: VbPosition[] = [];
  for (const roh of wert['positionen'] as unknown[]) {
    const position = pruefePosition(roh, ids);
    if (!position) return null;
    positionen.push(position);
  }
  return {
    id: wert['id'],
    herkunftId: wert['herkunftId'],
    ueberschrift: wert['ueberschrift'],
    lagerort: wert['lagerort'],
    transportMit: wert['transportMit'],
    auftraggeber: wert['auftraggeber'],
    fachgruppe: wert['fachgruppe'],
    positionen,
  };
}

function pruefeAbschnitt(
  wert: unknown,
  ids: Set<string>,
  zaehler: { laufzettel: number },
): VbAbschnitt | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['id', 'herkunftId', 'titel', 'farbe', 'fachgruppe', 'laufzettel']) ||
    !istUuid(wert['id']) ||
    ids.has(wert['id']) ||
    !istUuidOderNull(wert['herkunftId']) ||
    !istNichtleererText(wert['titel']) ||
    wert['titel'].length > TEXT_MAX ||
    !istText(wert['farbe']) ||
    !ABSCHNITT_FARBEN.has(wert['farbe']) ||
    !istFachgruppeOderNull(wert['fachgruppe']) ||
    !Array.isArray(wert['laufzettel'])
  ) {
    return null;
  }
  zaehler.laufzettel += wert['laufzettel'].length;
  if (zaehler.laufzettel > MAX_LAUFZETTEL) return null;
  ids.add(wert['id']);
  const laufzettel: VbLaufzettel[] = [];
  for (const roh of wert['laufzettel'] as unknown[]) {
    const geprueft = pruefeLaufzettel(roh, ids);
    if (!geprueft) return null;
    laufzettel.push(geprueft);
  }
  return {
    id: wert['id'],
    herkunftId: wert['herkunftId'],
    titel: wert['titel'],
    farbe: wert['farbe'],
    fachgruppe: wert['fachgruppe'],
    laufzettel,
  };
}

export function pruefeVbInhalt(wert: unknown): VbInhalt | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['anweisungen', 'abschnitte']) ||
    !istText0bis(wert['anweisungen'], ANWEISUNGEN_MAX) ||
    !Array.isArray(wert['abschnitte']) ||
    wert['abschnitte'].length > MAX_ABSCHNITTE
  ) {
    return null;
  }
  const ids = new Set<string>();
  const zaehler = { laufzettel: 0 };
  const abschnitte: VbAbschnitt[] = [];
  for (const roh of wert['abschnitte'] as unknown[]) {
    const abschnitt = pruefeAbschnitt(roh, ids, zaehler);
    if (!abschnitt) return null;
    abschnitte.push(abschnitt);
  }
  return { anweisungen: wert['anweisungen'], abschnitte };
}

/** Kennzahlen setzt ausschließlich der Worker, nie der Anfragekörper. */
export function zaehleVb(inhalt: VbInhalt): VbKennzahlen {
  let laufzettel = 0;
  let positionen = 0;
  for (const abschnitt of inhalt.abschnitte) {
    laufzettel += abschnitt.laufzettel.length;
    for (const zettel of abschnitt.laufzettel) positionen += zettel.positionen.length;
  }
  return { abschnitte: inhalt.abschnitte.length, laufzettel, positionen };
}

export function pruefeEinsatz(wert: unknown): Einsatz | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, [
      'id',
      'titel',
      'beginn',
      'ende',
      'ort',
      'hiorgVeranstaltungId',
      'pepId',
    ]) ||
    !istUuid(wert['id']) ||
    !istNichtleererText(wert['titel']) ||
    wert['titel'].length > TEXT_MAX ||
    !(wert['beginn'] === null || istZeitpunkt(wert['beginn'])) ||
    !(wert['ende'] === null || istZeitpunkt(wert['ende'])) ||
    !(wert['ort'] === null || istText0bis(wert['ort'], TEXT_MAX)) ||
    !(
      wert['hiorgVeranstaltungId'] === null ||
      (istText(wert['hiorgVeranstaltungId']) && HIORG_ID.test(wert['hiorgVeranstaltungId']))
    ) ||
    !istUuidOderNull(wert['pepId'])
  ) {
    return null;
  }
  return {
    id: wert['id'],
    titel: wert['titel'],
    beginn: wert['beginn'],
    ende: wert['ende'],
    ort: wert['ort'],
    hiorgVeranstaltungId: wert['hiorgVeranstaltungId'],
    pepId: wert['pepId'],
  };
}

export function pruefeVorbereitung(wert: unknown): Vorbereitung | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['vorlageId', 'vorlageVersion', 'inhalt']) ||
    !istUuidOderNull(wert['vorlageId']) ||
    !(
      wert['vorlageVersion'] === null ||
      (typeof wert['vorlageVersion'] === 'number' &&
        Number.isSafeInteger(wert['vorlageVersion']) &&
        wert['vorlageVersion'] >= 1)
    )
  ) {
    return null;
  }
  const inhalt = pruefeVbInhalt(wert['inhalt']);
  if (!inhalt) return null;
  return { vorlageId: wert['vorlageId'], vorlageVersion: wert['vorlageVersion'], inhalt };
}

export function pruefeVbVorlage(wert: unknown): VbVorlage | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['id', 'titel', 'inhalt']) ||
    !istUuid(wert['id']) ||
    !istNichtleererText(wert['titel']) ||
    wert['titel'].length > TEXT_MAX
  ) {
    return null;
  }
  const inhalt = pruefeVbInhalt(wert['inhalt']);
  if (!inhalt) return null;
  return { id: wert['id'], titel: wert['titel'], inhalt };
}
