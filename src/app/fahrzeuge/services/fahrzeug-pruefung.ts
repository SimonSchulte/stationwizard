import {
  AblesungEingabe,
  Ablesungseinreichung,
  Aenderungseintrag,
  EIGENTUEMER,
  Eigentuemer,
  Fahrzeugstamm,
  GRUPPEN,
  Gruppe,
  Kilometerstand,
  KilometerQuelle,
  Wartungstermin,
} from '../models/fahrzeug.model';
import { istNichtleererText, istObjekt, istText } from '../../kern/text/pruefung';

/**
 * Prüfungen für unbekannte externe Daten (Worker-Antworten, künftig auch
 * Importe), bevor sie als Domänentyp weiterverwendet werden. Kein `any` und
 * kein ungeprüfter Cast – analog zu `einsatz/services/pep-datei.ts`.
 */

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const FIN_MUSTER = /^[A-HJ-NPR-Z0-9]{17}$/;
/** Beim Lesen vorkommende Quellen, einschließlich der nur serverseitig entstehenden. */
const KILOMETER_QUELLEN: readonly KilometerQuelle[] = [
  'qr',
  'formular',
  'korrektur',
  'oeffentlich',
];

/**
 * Was ein Client selbst angeben darf. `oeffentlich` fehlt absichtlich: der Wert
 * entsteht ausschließlich bei der Freigabe einer öffentlichen Kilometermeldung,
 * und der Worker weist ihn in einer Eingabe ab.
 */
const EINGEBBARE_QUELLEN: readonly KilometerQuelle[] = ['qr', 'formular', 'korrektur'];

export function istIsoDatum(wert: unknown): wert is string {
  return istText(wert) && ISO_DATUM.test(wert);
}

/** 17 Zeichen, ohne I/O/Q (verwechslungsgefährdet), Groß-/Kleinschreibung wird nicht geprüft. */
export function istGueltigeFin(wert: string): boolean {
  return FIN_MUSTER.test(wert.toUpperCase());
}

export function istEigentuemer(wert: unknown): wert is Eigentuemer {
  return istText(wert) && (EIGENTUEMER as readonly string[]).includes(wert);
}

export function istGruppe(wert: unknown): wert is Gruppe {
  return istText(wert) && (GRUPPEN as readonly string[]).includes(wert);
}

export function istWartungstermin(wert: unknown): wert is Wartungstermin {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    (wert['art'] === 'hu' || wert['art'] === 'frei') &&
    istNichtleererText(wert['bezeichnung']) &&
    istIsoDatum(wert['faelligAm']) &&
    typeof wert['erinnerungTage'] === 'number' &&
    Number.isFinite(wert['erinnerungTage']) &&
    wert['erinnerungTage'] >= 0 &&
    (wert['erledigtAm'] === null || istIsoDatum(wert['erledigtAm']))
  );
}

export function istFahrzeugstamm(wert: unknown): wert is Fahrzeugstamm {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istText(wert['funkrufname']) &&
    istText(wert['kennzeichen']) &&
    (wert['fahrgestellnummer'] === null || istText(wert['fahrgestellnummer'])) &&
    istEigentuemer(wert['eigentuemer']) &&
    istGruppe(wert['gruppe']) &&
    istText(wert['bemerkung']) &&
    Array.isArray(wert['wartungstermine']) &&
    wert['wartungstermine'].every(istWartungstermin) &&
    istNichtleererText(wert['geaendertAm']) &&
    istText(wert['geaendertVon'])
  );
}

export function istKilometerstand(wert: unknown): wert is Kilometerstand {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['fahrzeugId']) &&
    istIsoDatum(wert['abgelesenAm']) &&
    typeof wert['stand'] === 'number' &&
    Number.isFinite(wert['stand']) &&
    wert['stand'] >= 0 &&
    istNichtleererText(wert['erfasstAm']) &&
    istNichtleererText(wert['erfasstVon']) &&
    istText(wert['quelle']) &&
    (KILOMETER_QUELLEN as readonly string[]).includes(wert['quelle']) &&
    (wert['korrigiert'] === null || istNichtleererText(wert['korrigiert'])) &&
    istText(wert['bemerkung']) &&
    // Der Worker liefert das Feld immer, bei allen anderen Wegen leer.
    istText(wert['gemeldetVonName'])
  );
}

/**
 * Prüft eine Ablesungseingabe vor dem Absenden. Enthält bewusst keine
 * Prüfung von `erfasstVon` – dieses Feld existiert in der Eingabe nicht,
 * es wird ausschließlich serverseitig aus der geprüften Identität gesetzt.
 */
export function istAenderungseintrag(wert: unknown): wert is Aenderungseintrag {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['fahrzeugId']) &&
    istNichtleererText(wert['zeitpunkt']) &&
    istNichtleererText(wert['von']) &&
    istText(wert['beschreibung'])
  );
}

/**
 * Prüft eine offene Kilometermeldung aus der Worker-Antwort. `letzterStand`
 * darf `null` sein – ein Fahrzeug ohne jede Ablesung ist ein gültiger Fall und
 * wird nicht stillschweigend als 0 gerechnet.
 */
export function istAblesungseinreichung(wert: unknown): wert is Ablesungseinreichung {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['fahrzeugId']) &&
    istText(wert['bezeichnung']) &&
    istText(wert['kennzeichen']) &&
    istText(wert['gruppe']) &&
    (GRUPPEN as readonly string[]).includes(wert['gruppe']) &&
    istIsoDatum(wert['abgelesenAm']) &&
    typeof wert['stand'] === 'number' &&
    Number.isFinite(wert['stand']) &&
    wert['stand'] >= 0 &&
    istNichtleererText(wert['eingereichtAm']) &&
    istNichtleererText(wert['gemeldetVonName']) &&
    istText(wert['bemerkung']) &&
    (wert['letzterStand'] === null ||
      (typeof wert['letzterStand'] === 'number' && Number.isFinite(wert['letzterStand']))) &&
    (wert['letzterStandAm'] === null || istIsoDatum(wert['letzterStandAm']))
  );
}

export function istAblesungEingabe(wert: unknown): wert is AblesungEingabe {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['fahrzeugId']) &&
    istIsoDatum(wert['abgelesenAm']) &&
    typeof wert['stand'] === 'number' &&
    Number.isFinite(wert['stand']) &&
    wert['stand'] >= 0 &&
    istText(wert['quelle']) &&
    (EINGEBBARE_QUELLEN as readonly string[]).includes(wert['quelle']) &&
    (wert['korrigiert'] === null || istNichtleererText(wert['korrigiert'])) &&
    istText(wert['bemerkung'])
  );
}
