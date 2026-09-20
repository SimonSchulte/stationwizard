import { istNichtleererText, istObjekt, istText } from '../../kern/text/pruefung';
import { Angebot, Position, Schicht } from '../models/angebot.model';
import { istPreiskatalogArt } from './preiskatalog-pruefung';
import { istGueltigeSchichtzeit } from './schicht-validierung';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

export function istPosition(wert: unknown): wert is Position {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !(wert['herkunftEintragId'] === null || istNichtleererText(wert['herkunftEintragId'])) ||
    !istPreiskatalogArt(wert['art']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    typeof wert['einzelpreisCent'] !== 'number' ||
    !Number.isInteger(wert['einzelpreisCent']) ||
    wert['einzelpreisCent'] < 0 ||
    typeof wert['anzahl'] !== 'number' ||
    !Number.isInteger(wert['anzahl']) ||
    wert['anzahl'] < 1
  ) {
    return false;
  }
  return wert['art'] === 'fahrzeug'
    ? wert['stunden'] === null
    : typeof wert['stunden'] === 'number' &&
        Number.isFinite(wert['stunden']) &&
        wert['stunden'] > 0;
}

export function istSchicht(wert: unknown): wert is Schicht {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istText(wert['datum']) &&
    ISO_DATUM.test(wert['datum']) &&
    istText(wert['von']) &&
    istText(wert['bis']) &&
    istGueltigeSchichtzeit(wert['von'], wert['bis']) &&
    Array.isArray(wert['positionen']) &&
    wert['positionen'].every(istPosition)
  );
}

/** Prüft ein `<x>Aktiv`/`<x>Cent`-Wertepaar: bei aktivem Flag ist der Cent-Wert Pflicht, sonst optional. */
function istGueltigePauschale(aktiv: unknown, cent: unknown): boolean {
  if (typeof aktiv !== 'boolean') return false;
  if (aktiv) {
    return typeof cent === 'number' && Number.isInteger(cent) && cent >= 0;
  }
  return cent === null || (typeof cent === 'number' && Number.isInteger(cent) && cent >= 0);
}

export function istAngebot(wert: unknown): wert is Angebot {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istText(wert['auftraggeber']) &&
    istText(wert['bemerkung']) &&
    Array.isArray(wert['schichten']) &&
    wert['schichten'].every(istSchicht) &&
    istGueltigePauschale(wert['materialpauschaleAktiv'], wert['materialpauschaleCent']) &&
    istGueltigePauschale(wert['pauschalpreisAktiv'], wert['pauschalpreisCent']) &&
    istNichtleererText(wert['geaendertAm']) &&
    istText(wert['geaendertVon'])
  );
}
