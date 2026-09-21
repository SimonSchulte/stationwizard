import { istNichtleererText, istObjekt, istText } from '../../kern/text/pruefung';
import { CheckEinreichung, CheckEinreichungDetail } from '../models/einreichung.model';
import { istCheckposition } from './check-pruefung';

/** Prüfungen für die Worker-Antworten der Einreichungen. */

function istGanzzahlAb(wert: unknown, untergrenze: number): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= untergrenze;
}

export function istCheckEinreichung(wert: unknown): wert is CheckEinreichung {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['behaelterId']) &&
    istText(wert['behaelterBezeichnung']) &&
    istText(wert['fahrzeugBezeichnung']) &&
    istText(wert['vorlageBezeichnung']) &&
    istNichtleererText(wert['geprueftAm']) &&
    istNichtleererText(wert['eingereichtAm']) &&
    istText(wert['eingereichtVonName']) &&
    typeof wert['verfallsdatumErfasst'] === 'boolean' &&
    istText(wert['bemerkung']) &&
    istGanzzahlAb(wert['positionenGesamt'], 0) &&
    istGanzzahlAb(wert['positionenGeprueft'], 0) &&
    istGanzzahlAb(wert['fehlmengen'], 0) &&
    istGanzzahlAb(wert['unbrauchbar'], 0) &&
    istGanzzahlAb(wert['abgelaufen'], 0)
  );
}

export function istCheckEinreichungDetail(wert: unknown): wert is CheckEinreichungDetail {
  return (
    istCheckEinreichung(wert) &&
    istObjekt(wert) &&
    istText(wert['grundlage']) &&
    Array.isArray(wert['positionen']) &&
    wert['positionen'].every(istCheckposition)
  );
}
