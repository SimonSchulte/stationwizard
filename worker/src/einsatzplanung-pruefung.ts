import { TEXT_MAX } from './einsatzplanung-gemeinsam';
import { istNichtleererText, istObjekt, istText, UUID_REGEX } from './json-lesen';

/**
 * Gemeinsame Prüfprimitive und Prüfung der Einsätze (Datenvertrag, Konzept Abschnitt 9):
 * unbekannte Felder werden abgelehnt, Längen und Mengen begrenzt, Ids innerhalb
 * eines Inhalts eindeutig. Jede Funktion liefert den geprüften Wert oder `null`.
 */

export interface Einsatz {
  id: string;
  titel: string;
  beginn: string | null;
  ende: string | null;
  ort: string | null;
  hiorgVeranstaltungId: string | null;
}
const HIORG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ZEITPUNKT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function hatNurFelder(wert: Record<string, unknown>, erlaubt: readonly string[]): boolean {
  return Object.keys(wert).every((schluessel) => erlaubt.includes(schluessel));
}

export function istUuid(wert: unknown): wert is string {
  return typeof wert === 'string' && UUID_REGEX.test(wert);
}

export function istUuidOderNull(wert: unknown): wert is string | null {
  return wert === null || istUuid(wert);
}

export function istText0bis(wert: unknown, max: number): wert is string {
  return istText(wert) && wert.length <= max;
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

export function pruefeEinsatz(wert: unknown): Einsatz | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['id', 'titel', 'beginn', 'ende', 'ort', 'hiorgVeranstaltungId']) ||
    !istUuid(wert['id']) ||
    !istNichtleererText(wert['titel']) ||
    wert['titel'].length > TEXT_MAX ||
    !(wert['beginn'] === null || istZeitpunkt(wert['beginn'])) ||
    !(wert['ende'] === null || istZeitpunkt(wert['ende'])) ||
    !(wert['ort'] === null || istText0bis(wert['ort'], TEXT_MAX)) ||
    !(
      wert['hiorgVeranstaltungId'] === null ||
      (istText(wert['hiorgVeranstaltungId']) && HIORG_ID.test(wert['hiorgVeranstaltungId']))
    )
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
  };
}
