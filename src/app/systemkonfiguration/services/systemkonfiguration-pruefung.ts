import {
  Einstellungen,
  Systemkonfiguration,
  VERSANDWEGE,
  Versandweg,
  VersandwegStatus,
} from '../models/systemkonfiguration.model';

/** Prüfungen für die Worker-Antwort, bevor sie als Domänentyp weiterläuft. */

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

export function istVersandweg(wert: unknown): wert is Versandweg {
  return istText(wert) && (VERSANDWEGE as readonly string[]).includes(wert);
}

function istEinstellungen(wert: unknown): wert is Einstellungen {
  return (
    istObjekt(wert) &&
    istText(wert['kmBerichtEmpfaenger']) &&
    istVersandweg(wert['kmBerichtVersandweg']) &&
    istText(wert['kmBerichtBetreff'])
  );
}

function istVersandwegStatus(wert: unknown): wert is VersandwegStatus {
  return istObjekt(wert) && istVersandweg(wert['weg']) && typeof wert['verfuegbar'] === 'boolean';
}

export function istSystemkonfiguration(wert: unknown): wert is Systemkonfiguration {
  return (
    istObjekt(wert) &&
    istEinstellungen(wert['einstellungen']) &&
    Array.isArray(wert['versandwege']) &&
    wert['versandwege'].every(istVersandwegStatus)
  );
}
