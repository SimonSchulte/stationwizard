import { istNichtleererText, istObjekt, istText, UUID_REGEX } from './json-lesen';

/** Prüfung fremder Eingaben für Stammdaten, Wartungstermine und Ablesungen. */

const EIGENTUEMER = new Set(['land-nrw', 'bund', 'organisation']);
const GRUPPEN = new Set(['betreuung', 'tesi', 'fuehrung', 'sanitaet']);
const WARTUNGS_ARTEN = new Set(['hu', 'frei']);
/**
 * Quellen, die ein Client selbst angeben darf. 'oeffentlich' fehlt hier
 * absichtlich: dieser Wert entsteht ausschließlich intern bei der Freigabe
 * einer öffentlichen Kilometermeldung (siehe `einreichungen.ts`). Stünde er
 * hier, könnte jede angemeldete Person eine Freigabe fingieren.
 */
const KILOMETER_QUELLEN_EINGABE = new Set(['qr', 'formular', 'korrektur']);
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const FIN_MUSTER = /^[A-HJ-NPR-Z0-9]{17}$/i;
function istWartungstermin(wert: unknown): boolean {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istText(wert['art']) &&
    WARTUNGS_ARTEN.has(wert['art']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istText(wert['faelligAm']) &&
    ISO_DATUM.test(wert['faelligAm']) &&
    typeof wert['erinnerungTage'] === 'number' &&
    Number.isFinite(wert['erinnerungTage']) &&
    wert['erinnerungTage'] >= 0 &&
    (wert['erledigtAm'] === null ||
      (istText(wert['erledigtAm']) && ISO_DATUM.test(wert['erledigtAm'])))
  );
}

export interface FahrzeugEingabe {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  fahrgestellnummer: string | null;
  eigentuemer: string;
  gruppe: string;
  bemerkung: string;
  wartungstermine: unknown[];
}

export function pruefeFahrzeugEingabe(wert: unknown): FahrzeugEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istText(wert['funkrufname']) ||
    !istText(wert['kennzeichen']) ||
    !(wert['fahrgestellnummer'] === null || istText(wert['fahrgestellnummer'])) ||
    (istText(wert['fahrgestellnummer']) &&
      wert['fahrgestellnummer'].length > 0 &&
      !FIN_MUSTER.test(wert['fahrgestellnummer'])) ||
    !istText(wert['eigentuemer']) ||
    !EIGENTUEMER.has(wert['eigentuemer']) ||
    !istText(wert['gruppe']) ||
    !GRUPPEN.has(wert['gruppe']) ||
    !istText(wert['bemerkung']) ||
    !Array.isArray(wert['wartungstermine']) ||
    !wert['wartungstermine'].every(istWartungstermin)
  ) {
    return null;
  }
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    funkrufname: wert['funkrufname'],
    kennzeichen: wert['kennzeichen'],
    fahrgestellnummer:
      istText(wert['fahrgestellnummer']) && wert['fahrgestellnummer'].length > 0
        ? wert['fahrgestellnummer']
        : null,
    eigentuemer: wert['eigentuemer'],
    gruppe: wert['gruppe'],
    bemerkung: wert['bemerkung'],
    wartungstermine: wert['wartungstermine'],
  };
}

interface AblesungEingabe {
  abgelesenAm: string;
  stand: number;
  quelle: string;
  korrigiert: string | null;
  bemerkung: string;
}

export function pruefeAblesungEingabe(wert: unknown): AblesungEingabe | null {
  if (
    !istObjekt(wert) ||
    !istText(wert['abgelesenAm']) ||
    !ISO_DATUM.test(wert['abgelesenAm']) ||
    typeof wert['stand'] !== 'number' ||
    !Number.isFinite(wert['stand']) ||
    wert['stand'] < 0 ||
    !istText(wert['quelle']) ||
    !KILOMETER_QUELLEN_EINGABE.has(wert['quelle']) ||
    !(wert['korrigiert'] === null || istNichtleererText(wert['korrigiert'])) ||
    !istText(wert['bemerkung'])
  ) {
    return null;
  }
  return {
    abgelesenAm: wert['abgelesenAm'],
    stand: wert['stand'],
    quelle: wert['quelle'],
    korrigiert: istText(wert['korrigiert']) ? wert['korrigiert'] : null,
    bemerkung: wert['bemerkung'],
  };
}
