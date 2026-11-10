import { istObjekt, istText } from '../../kern/text/pruefung';
import { AufbauKennzahlen } from '../models/aufbau.model';
import { EinsatzListenEintrag, Einsatz } from '../models/einsatz.model';

/**
 * Prüfungen für unbekannte externe Daten (Worker-Antworten) gegen den Datenvertrag
 * (`docs/konzept-einsatzplanung-vb.md`, Abschnitt 9): Grenzen, keine unbekannten Felder.
 * Enthält die gemeinsamen Prüfprimitive von Einsatz, PEP und Aufbau.
 */

/** Höchstlänge von Titel und Ort eines Einsatzes (Vertrag). */
export const EINSATZ_TEXT_MAX = 200;
export const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HIORG_ID_MUSTER = /^[A-Za-z0-9_-]{1,64}$/;
const LOKALE_ZEIT_MUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function nurFelder(objekt: Record<string, unknown>, erlaubt: readonly string[]): boolean {
  return Object.keys(objekt).every((schluessel) => erlaubt.includes(schluessel));
}

export function istUuid(wert: unknown): wert is string {
  return istText(wert) && UUID_MUSTER.test(wert);
}

export function istTextBis(wert: unknown, max: number, min = 0): wert is string {
  return istText(wert) && wert.length >= min && wert.length <= max;
}

export function istUuidOderNull(wert: unknown): boolean {
  return wert === null || istUuid(wert);
}

export function istGanzzahlAb(wert: unknown, min: number): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= min;
}

/** Kennzahlen des Aufbaus in der Einsatzliste. */
export function istAufbauKennzahlen(wert: unknown): wert is AufbauKennzahlen {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['einheiten', 'kisten', 'positionen']) &&
    istGanzzahlAb(wert['einheiten'], 0) &&
    istGanzzahlAb(wert['kisten'], 0) &&
    istGanzzahlAb(wert['positionen'], 0)
  );
}

/** Kennzahlen einer PEP in der Einsatzliste (hier, damit `pep-pruefung.ts` keinen Zyklus bildet). */
export function istPepKennzahlen(wert: unknown): boolean {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['posten', 'positionen', 'besetzt']) &&
    istGanzzahlAb(wert['posten'], 0) &&
    istGanzzahlAb(wert['positionen'], 0) &&
    istGanzzahlAb(wert['besetzt'], 0)
  );
}

function istLokaleZeitOderNull(wert: unknown): boolean {
  return wert === null || (istText(wert) && LOKALE_ZEIT_MUSTER.test(wert));
}

/** Prüft die Einsatzfelder; `zusatz` nennt weitere erlaubte Felder (Listeneintrag). */
function istEinsatzMitFeldern(wert: unknown, zusatz: readonly string[]): wert is Einsatz {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'titel', 'beginn', 'ende', 'ort', 'hiorgVeranstaltungId', ...zusatz]) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], EINSATZ_TEXT_MAX, 1) &&
    istLokaleZeitOderNull(wert['beginn']) &&
    istLokaleZeitOderNull(wert['ende']) &&
    (wert['ort'] === null || istTextBis(wert['ort'], EINSATZ_TEXT_MAX)) &&
    (wert['hiorgVeranstaltungId'] === null ||
      (istText(wert['hiorgVeranstaltungId']) && HIORG_ID_MUSTER.test(wert['hiorgVeranstaltungId'])))
  );
}

export function istEinsatz(wert: unknown): wert is Einsatz {
  return istEinsatzMitFeldern(wert, []);
}

export function istEinsatzListenEintrag(wert: unknown): wert is EinsatzListenEintrag {
  if (!istEinsatzMitFeldern(wert, ['version', 'aufbau', 'pep'])) return false;
  // `wert` ist hier ein Einsatz; die Zusatzfelder liegen unter dem Indexzugriff.
  const objekt: Record<string, unknown> = { ...wert };
  const aufbau = objekt['aufbau'];
  return (
    istGanzzahlAb(objekt['version'], 1) &&
    (aufbau === null || istAufbauKennzahlen(aufbau)) &&
    (objekt['pep'] === null || istPepKennzahlen(objekt['pep']))
  );
}
