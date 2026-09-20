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

export function istAngebot(wert: unknown): wert is Angebot {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istText(wert['auftraggeber']) ||
    !istText(wert['bemerkung']) ||
    !Array.isArray(wert['schichten']) ||
    !wert['schichten'].every(istSchicht) ||
    typeof wert['pauschalpreisAktiv'] !== 'boolean' ||
    !istNichtleererText(wert['geaendertAm']) ||
    !istText(wert['geaendertVon'])
  ) {
    return false;
  }
  const pauschalpreisCent = wert['pauschalpreisCent'];
  if (wert['pauschalpreisAktiv']) {
    return (
      typeof pauschalpreisCent === 'number' &&
      Number.isInteger(pauschalpreisCent) &&
      pauschalpreisCent >= 0
    );
  }
  return (
    pauschalpreisCent === null ||
    (typeof pauschalpreisCent === 'number' &&
      Number.isInteger(pauschalpreisCent) &&
      pauschalpreisCent >= 0)
  );
}
