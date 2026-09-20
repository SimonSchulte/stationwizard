import { istNichtleererText, istObjekt, istText } from '../../kern/text/pruefung';
import {
  PREISKATALOG_ARTEN,
  PreiskatalogArt,
  PreiskatalogEintrag,
} from '../models/preiskatalog.model';

/**
 * Prüfungen für unbekannte externe Daten (Worker-Antworten), bevor sie als
 * Domänentyp weiterverwendet werden. Kein `any` und kein ungeprüfter Cast –
 * analog zu `fahrzeuge/services/fahrzeug-pruefung.ts`.
 */

export function istPreiskatalogArt(wert: unknown): wert is PreiskatalogArt {
  return istText(wert) && (PREISKATALOG_ARTEN as readonly string[]).includes(wert);
}

export function istPreiskatalogEintrag(wert: unknown): wert is PreiskatalogEintrag {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istPreiskatalogArt(wert['art']) &&
    typeof wert['einzelpreisCent'] === 'number' &&
    Number.isInteger(wert['einzelpreisCent']) &&
    wert['einzelpreisCent'] >= 0 &&
    istNichtleererText(wert['geaendertAm']) &&
    istText(wert['geaendertVon']) &&
    typeof wert['version'] === 'number' &&
    Number.isInteger(wert['version']) &&
    wert['version'] >= 1
  );
}
