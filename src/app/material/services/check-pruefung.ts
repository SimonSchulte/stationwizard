import { istNichtleererText, istObjekt, istText } from '../../kern/text/pruefung';
import {
  CheckKopf,
  Checkposition,
  Checkquelle,
  Fahrzeugcheck,
  Pruefauftrag,
} from '../models/check.model';
import { istHerkunft, istPruefFach } from './material-pruefung';

/** Prüfungen für Worker-Antworten des Fahrzeugchecks. */

function istGanzzahlAb(wert: unknown, untergrenze: number): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= untergrenze;
}

function istCheckquelle(wert: unknown): wert is Checkquelle {
  return wert === 'angemeldet' || wert === 'oeffentlich';
}

export function istCheckKopf(wert: unknown): wert is CheckKopf {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['behaelterId']) &&
    istNichtleererText(wert['vorlageId']) &&
    istText(wert['vorlageBezeichnung']) &&
    istNichtleererText(wert['geprueftAm']) &&
    istNichtleererText(wert['erfasstAm']) &&
    istText(wert['erfasstVon']) &&
    (wert['gemeldetVonName'] === null || istText(wert['gemeldetVonName'])) &&
    istCheckquelle(wert['quelle']) &&
    typeof wert['verfallsdatumErfasst'] === 'boolean' &&
    istText(wert['bemerkung']) &&
    istGanzzahlAb(wert['positionenGesamt'], 0) &&
    istGanzzahlAb(wert['positionenGeprueft'], 0) &&
    istGanzzahlAb(wert['fehlmengen'], 0) &&
    istGanzzahlAb(wert['unbrauchbar'], 0) &&
    istGanzzahlAb(wert['abgelaufen'], 0)
  );
}

export function istCheckposition(wert: unknown): wert is Checkposition {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['artikelId']) &&
    istNichtleererText(wert['fachId']) &&
    istText(wert['fach']) &&
    istText(wert['bezeichnung']) &&
    istGanzzahlAb(wert['sollMenge'], 1) &&
    istText(wert['einheit']) &&
    istHerkunft(wert['herkunft']) &&
    typeof wert['verfallsdatumPflicht'] === 'boolean' &&
    typeof wert['geprueft'] === 'boolean' &&
    istGanzzahlAb(wert['istMenge'], 0) &&
    typeof wert['unbrauchbar'] === 'boolean' &&
    Array.isArray(wert['verfallsdaten']) &&
    wert['verfallsdaten'].every((eintrag) => eintrag === null || istText(eintrag))
  );
}

export function istFahrzeugcheck(wert: unknown): wert is Fahrzeugcheck {
  return (
    istCheckKopf(wert) &&
    istObjekt(wert) &&
    istText(wert['grundlage']) &&
    istGanzzahlAb(wert['vorlageVersion'], 1) &&
    Array.isArray(wert['positionen']) &&
    wert['positionen'].every(istCheckposition)
  );
}

export function istPruefauftrag(wert: unknown): wert is Pruefauftrag {
  if (!istObjekt(wert)) return false;
  const behaelter = wert['behaelter'];
  const vorlage = wert['vorlage'];
  return (
    istObjekt(behaelter) &&
    istNichtleererText(behaelter['id']) &&
    istNichtleererText(behaelter['bezeichnung']) &&
    istText(behaelter['bemerkung']) &&
    istText(behaelter['fahrzeugBezeichnung']) &&
    istText(behaelter['fahrzeugFunkrufname']) &&
    istText(behaelter['fahrzeugGruppe']) &&
    istObjekt(vorlage) &&
    istNichtleererText(vorlage['id']) &&
    istText(vorlage['bezeichnung']) &&
    istText(vorlage['grundlage']) &&
    istGanzzahlAb(vorlage['version'], 1) &&
    Array.isArray(vorlage['faecher']) &&
    vorlage['faecher'].every(istPruefFach)
  );
}
