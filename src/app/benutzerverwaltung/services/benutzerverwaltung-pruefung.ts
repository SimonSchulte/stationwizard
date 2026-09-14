import {
  Benutzerkonto,
  HAUPTROLLEN,
  Hauptrolle,
  SONDERROLLEN,
  Sonderrolle,
} from '../models/benutzerkonto.model';

/**
 * Prüfungen für unbekannte externe Daten (Worker-Antworten), bevor sie als
 * Domänentyp weiterverwendet werden. Kein `any` und kein ungeprüfter Cast –
 * analog zu `fahrzeuge/services/fahrzeug-pruefung.ts`.
 */

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istNichtleererText(wert: unknown): wert is string {
  return istText(wert) && wert.trim().length > 0;
}

export function istHauptrolle(wert: unknown): wert is Hauptrolle {
  return istText(wert) && (HAUPTROLLEN as readonly string[]).includes(wert);
}

export function istSonderrolle(wert: unknown): wert is Sonderrolle {
  return istText(wert) && (SONDERROLLEN as readonly string[]).includes(wert);
}

export function istBenutzerkonto(wert: unknown): wert is Benutzerkonto {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['email']) &&
    (wert['rolle'] === null || istHauptrolle(wert['rolle'])) &&
    Array.isArray(wert['sonderrollen']) &&
    wert['sonderrollen'].every(istSonderrolle) &&
    istNichtleererText(wert['ersterZugriffAm']) &&
    istNichtleererText(wert['letzterZugriffAm']) &&
    (wert['rolleGeaendertAm'] === null || istNichtleererText(wert['rolleGeaendertAm'])) &&
    (wert['rolleGeaendertVon'] === null || istNichtleererText(wert['rolleGeaendertVon']))
  );
}
