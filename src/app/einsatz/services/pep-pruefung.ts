import { istObjekt, istText } from '../../kern/text/pruefung';
import {
  Pep,
  PEP_GRENZEN,
  PepAnforderungen,
  PepEinsatzkraft,
  PepFahrzeug,
  PepInhalt,
  PepPosition,
  PepPosten,
  PepVorlage,
  PepVorlageInhalt,
  PepVorlageKopf,
} from '../models/pep.model';
import { MEDIZINISCH_ORDER, TAKTISCH_ORDER } from '../models/planung.model';
import { istGanzzahlAb, istTextBis, istUuid, istUuidOderNull, nurFelder } from './einsatz-pruefung';

/**
 * Prüfungen für unbekannte externe Daten (Worker-Antworten, Vorlagen) gegen den Vertrag
 * (`docs/konzept-einsatzplanung-vb.md`, Abschnitt 10): Grenzen, je Art eindeutige Ids,
 * Verweise auf vorhandene Einsatzkräfte, keine unbekannten Felder.
 */

function istId(wert: unknown): wert is string {
  return istTextBis(wert, PEP_GRENZEN.id, 1);
}

function istTextOderNull(wert: unknown, max: number): boolean {
  return wert === null || istTextBis(wert, max);
}

function istTaktisch(wert: unknown): boolean {
  return typeof wert === 'string' && (TAKTISCH_ORDER as readonly string[]).includes(wert);
}

function istMedizinisch(wert: unknown): boolean {
  return typeof wert === 'string' && (MEDIZINISCH_ORDER as readonly string[]).includes(wert);
}

function istFahrzeug(wert: unknown): wert is PepFahrzeug {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['funkruf', 'seriennummer', 'hiorgId']) &&
    istTextBis(wert['funkruf'], PEP_GRENZEN.bezeichnung) &&
    istTextOderNull(wert['seriennummer'], PEP_GRENZEN.bezeichnung) &&
    istTextOderNull(wert['hiorgId'], PEP_GRENZEN.id)
  );
}

function istAnforderungen(wert: unknown): wert is PepAnforderungen {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['taktisch', 'medizinisch', 'zusatz']) &&
    (wert['taktisch'] === null || istTaktisch(wert['taktisch'])) &&
    (wert['medizinisch'] === null || istMedizinisch(wert['medizinisch'])) &&
    istTextOderNull(wert['zusatz'], PEP_GRENZEN.zusatzAnforderung)
  );
}

function istPosition(wert: unknown): wert is PepPosition {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'bezeichnung', 'anforderungen', 'postenfuehrer', 'einsatzkraftId']) &&
    istId(wert['id']) &&
    istTextBis(wert['bezeichnung'], PEP_GRENZEN.bezeichnung) &&
    istAnforderungen(wert['anforderungen']) &&
    typeof wert['postenfuehrer'] === 'boolean' &&
    (wert['einsatzkraftId'] === null || istId(wert['einsatzkraftId']))
  );
}

function istPosten(wert: unknown): wert is PepPosten {
  return (
    istObjekt(wert) &&
    nurFelder(wert, [
      'id',
      'bezeichnung',
      'fahrzeug',
      'telefonnummer',
      'hiorgSchichtId',
      'positionen',
    ]) &&
    istId(wert['id']) &&
    istTextBis(wert['bezeichnung'], PEP_GRENZEN.bezeichnung, 1) &&
    (wert['fahrzeug'] === null || istFahrzeug(wert['fahrzeug'])) &&
    istTextOderNull(wert['telefonnummer'], PEP_GRENZEN.telefonnummer) &&
    istTextOderNull(wert['hiorgSchichtId'], PEP_GRENZEN.hiorgSchichtId) &&
    Array.isArray(wert['positionen']) &&
    wert['positionen'].length <= PEP_GRENZEN.positionenJePosten &&
    wert['positionen'].every(istPosition)
  );
}

function istEinsatzkraft(wert: unknown): wert is PepEinsatzkraft {
  return (
    istObjekt(wert) &&
    nurFelder(wert, [
      'id',
      'name',
      'taktisch',
      'medizinisch',
      'zusatz',
      'notiz',
      'hiorgOrgId',
      'telefonnummer',
      'kuerzel',
    ]) &&
    istId(wert['id']) &&
    istTextBis(wert['name'], PEP_GRENZEN.name, 1) &&
    Array.isArray(wert['taktisch']) &&
    wert['taktisch'].every(istTaktisch) &&
    Array.isArray(wert['medizinisch']) &&
    wert['medizinisch'].every(istMedizinisch) &&
    Array.isArray(wert['zusatz']) &&
    wert['zusatz'].length <= PEP_GRENZEN.zusatzJeEinsatzkraft &&
    wert['zusatz'].every((z) => istTextBis(z, PEP_GRENZEN.zusatzText)) &&
    istTextOderNull(wert['notiz'], PEP_GRENZEN.notiz) &&
    istTextOderNull(wert['hiorgOrgId'], PEP_GRENZEN.id) &&
    istTextOderNull(wert['telefonnummer'], PEP_GRENZEN.telefonnummer) &&
    (wert['kuerzel'] === undefined || istTextOderNull(wert['kuerzel'], PEP_GRENZEN.kuerzel))
  );
}

function sindEindeutig(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

/** Posten und Positionen: Grenzen und je Art eindeutige Ids. */
function sindPostenGueltig(posten: unknown): posten is PepPosten[] {
  if (!Array.isArray(posten) || posten.length > PEP_GRENZEN.posten || !posten.every(istPosten)) {
    return false;
  }
  const liste: PepPosten[] = posten;
  return (
    sindEindeutig(liste.map((p) => p.id)) &&
    sindEindeutig(liste.flatMap((p) => p.positionen.map((pos) => pos.id)))
  );
}

export function istPepInhalt(wert: unknown): wert is PepInhalt {
  if (
    !istObjekt(wert) ||
    !nurFelder(wert, ['beschreibung', 'posten', 'einsatzkraefte', 'einsatzleiterId']) ||
    !istTextBis(wert['beschreibung'], PEP_GRENZEN.beschreibung) ||
    !sindPostenGueltig(wert['posten']) ||
    !Array.isArray(wert['einsatzkraefte']) ||
    wert['einsatzkraefte'].length > PEP_GRENZEN.einsatzkraefte ||
    !wert['einsatzkraefte'].every(istEinsatzkraft)
  ) {
    return false;
  }
  const posten: PepPosten[] = wert['posten'];
  const kraefte: PepEinsatzkraft[] = wert['einsatzkraefte'];
  const ids = kraefte.map((k) => k.id);
  if (!sindEindeutig(ids)) return false;
  const bekannt = new Set(ids);
  const leiter = wert['einsatzleiterId'];
  if (leiter !== null && !(istId(leiter) && bekannt.has(leiter))) return false;
  return posten.every((p) =>
    p.positionen.every((pos) => pos.einsatzkraftId === null || bekannt.has(pos.einsatzkraftId)),
  );
}

export function istPepVorlageInhalt(wert: unknown): wert is PepVorlageInhalt {
  if (
    !istObjekt(wert) ||
    !nurFelder(wert, ['beschreibung', 'posten']) ||
    !istTextBis(wert['beschreibung'], PEP_GRENZEN.beschreibung) ||
    !sindPostenGueltig(wert['posten'])
  ) {
    return false;
  }
  const posten: PepPosten[] = wert['posten'];
  return posten.every((p) => p.positionen.every((pos) => pos.einsatzkraftId === null));
}

export function istPep(wert: unknown): wert is Pep {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['schema', 'vorlageId', 'inhalt']) &&
    wert['schema'] === 1 &&
    istUuidOderNull(wert['vorlageId']) &&
    istPepInhalt(wert['inhalt'])
  );
}

export function istPepVorlage(wert: unknown): wert is PepVorlage {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'titel', 'inhalt']) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], PEP_GRENZEN.titel, 1) &&
    istPepVorlageInhalt(wert['inhalt'])
  );
}

export function istPepVorlageKopf(wert: unknown): wert is PepVorlageKopf {
  return (
    istObjekt(wert) &&
    nurFelder(wert, ['id', 'titel', 'version', 'posten', 'positionen', 'geaendertAm']) &&
    istUuid(wert['id']) &&
    istTextBis(wert['titel'], PEP_GRENZEN.titel, 1) &&
    istGanzzahlAb(wert['version'], 1) &&
    istGanzzahlAb(wert['posten'], 0) &&
    istGanzzahlAb(wert['positionen'], 0) &&
    istText(wert['geaendertAm']) &&
    wert['geaendertAm'].length > 0
  );
}
