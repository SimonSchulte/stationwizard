import {
  Einstellungen,
  Systemkonfiguration,
  VERSANDWEGE,
  Versandweg,
  VersandwegStatus,
} from '../models/systemkonfiguration.model';
import { istObjekt, istText } from '../../kern/text/pruefung';

/** Prüfungen für die Worker-Antwort, bevor sie als Domänentyp weiterläuft. */

export function istVersandweg(wert: unknown): wert is Versandweg {
  return istText(wert) && (VERSANDWEGE as readonly string[]).includes(wert);
}

function istGanzzahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert);
}

function istEinstellungen(wert: unknown): wert is Einstellungen {
  return (
    istObjekt(wert) &&
    istText(wert['kmBerichtEmpfaenger']) &&
    istVersandweg(wert['kmBerichtVersandweg']) &&
    istText(wert['kmBerichtBetreff']) &&
    istGanzzahl(wert['kmAmpelSchwellenwertGelbMonate']) &&
    istGanzzahl(wert['kmAmpelSchwellenwertRotMonate'])
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
