import { istNichtleererText, istObjekt, istText } from '../../kern/text/pruefung';
import { Behaelter, BehaelterUebersicht } from '../models/behaelter.model';
import {
  HERKUENFTE,
  Herkunft,
  PruefArtikel,
  PruefFach,
  Pruefvorlage,
  PruefvorlageKopf,
} from '../models/pruefvorlage.model';

/**
 * Prüfungen für unbekannte externe Daten (Worker-Antworten), bevor sie als
 * Domänentyp weiterverwendet werden. Kein `any` und kein ungeprüfter Cast –
 * analog zu `angebotswesen/services/preiskatalog-pruefung.ts`.
 */

function istGanzzahlAb(wert: unknown, untergrenze: number): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= untergrenze;
}

export function istHerkunft(wert: unknown): wert is Herkunft {
  return istText(wert) && (HERKUENFTE as readonly string[]).includes(wert);
}

export function istPruefArtikel(wert: unknown): wert is PruefArtikel {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istGanzzahlAb(wert['sollMenge'], 1) &&
    istText(wert['einheit']) &&
    istHerkunft(wert['herkunft']) &&
    typeof wert['verfallsdatumPflicht'] === 'boolean'
  );
}

export function istPruefFach(wert: unknown): wert is PruefFach {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['bezeichnung']) &&
    Array.isArray(wert['artikel']) &&
    wert['artikel'].every(istPruefArtikel)
  );
}

export function istPruefvorlage(wert: unknown): wert is Pruefvorlage {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istText(wert['beschreibung']) &&
    istText(wert['grundlage']) &&
    Array.isArray(wert['faecher']) &&
    wert['faecher'].every(istPruefFach) &&
    istNichtleererText(wert['geaendertAm']) &&
    istText(wert['geaendertVon'])
  );
}

export function istPruefvorlageKopf(wert: unknown): wert is PruefvorlageKopf {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istText(wert['beschreibung']) &&
    istText(wert['grundlage']) &&
    istGanzzahlAb(wert['anzahlFaecher'], 0) &&
    istGanzzahlAb(wert['anzahlArtikel'], 0) &&
    istNichtleererText(wert['geaendertAm']) &&
    istText(wert['geaendertVon'])
  );
}

export function istBehaelter(wert: unknown): wert is Behaelter {
  return (
    istObjekt(wert) &&
    istNichtleererText(wert['id']) &&
    istNichtleererText(wert['fahrzeugId']) &&
    istNichtleererText(wert['vorlageId']) &&
    istNichtleererText(wert['bezeichnung']) &&
    istText(wert['bemerkung']) &&
    istNichtleererText(wert['geaendertAm']) &&
    istText(wert['geaendertVon'])
  );
}

/** `null` ist bei allen Kennzahlen zulässig: ein Behälter ohne Check hat keine. */
function istZahlOderNull(wert: unknown): wert is number | null {
  return wert === null || istGanzzahlAb(wert, 0);
}

export function istBehaelterUebersicht(wert: unknown): wert is BehaelterUebersicht {
  return (
    istBehaelter(wert) &&
    istObjekt(wert) &&
    istText(wert['fahrzeugBezeichnung']) &&
    istText(wert['fahrzeugFunkrufname']) &&
    istText(wert['fahrzeugGruppe']) &&
    istText(wert['vorlageBezeichnung']) &&
    (wert['zuletztGeprueftAm'] === null || istNichtleererText(wert['zuletztGeprueftAm'])) &&
    (wert['letzterCheckId'] === null || istNichtleererText(wert['letzterCheckId'])) &&
    istZahlOderNull(wert['letzteFehlmengen']) &&
    istZahlOderNull(wert['letzteUnbrauchbar']) &&
    istZahlOderNull(wert['letzteAbgelaufen'])
  );
}
