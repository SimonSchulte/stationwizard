import {
  TEXT_MAX,
  MAX_PEP_EINSATZKRAEFTE,
  MAX_PEP_POSITIONEN_JE_POSTEN,
  MAX_PEP_POSTEN,
  PEP_BESCHREIBUNG_MAX,
  PEP_ID_MAX,
  PEP_NOTIZ_MAX,
  PEP_KUERZEL_MAX,
  PEP_TELEFON_MAX,
  PEP_ZUSATZ_MAX,
  PEP_ZUSATZ_JE_KRAFT_MAX,
} from './einsatzplanung-gemeinsam';
import { hatNurFelder, istText0bis, istUuid, istUuidOderNull } from './einsatzplanung-pruefung';
import { istNichtleererText, istObjekt, istText } from './json-lesen';

/**
 * Strikte Prüfung von PEP und PEP-Vorlage (Datenvertrag, Konzept Abschnitt 10): unbekannte
 * Felder werden abgelehnt, Längen und Mengen begrenzt, Ids je Art eindeutig, jede
 * `einsatzkraftId`/`einsatzleiterId` zeigt auf eine vorhandene Einsatzkraft. Jede Funktion
 * liefert den geprüften Wert oder `null`.
 */

// Spiegel von TAKTISCH_ORDER/MEDIZINISCH_ORDER in src/app/einsatz/models/planung.model.ts;
// Reihenfolge und Werte nur gemeinsam mit dem Frontend ändern (siehe match.service.spec.ts).
export const TAKTISCH_WERTE = ['H', 'KSH', 'GF', 'ZF', 'GdSA', 'VF'] as const;
export const MEDIZINISCH_WERTE = [
  'EH',
  'SSD',
  'SanH',
  'RH',
  'RS',
  'RA',
  'NotSan',
  'A',
  'NA',
] as const;

export interface PepFahrzeug {
  funkruf: string;
  seriennummer: string | null;
  hiorgId: string | null;
}
export interface PepAnforderungen {
  taktisch: string | null;
  medizinisch: string | null;
  zusatz: string | null;
}
export interface PepPosition {
  id: string;
  bezeichnung: string;
  anforderungen: PepAnforderungen;
  postenfuehrer: boolean;
  einsatzkraftId: string | null;
}
export interface PepPosten {
  id: string;
  bezeichnung: string;
  fahrzeug: PepFahrzeug | null;
  telefonnummer: string | null;
  hiorgSchichtId: string | null;
  positionen: PepPosition[];
}
export interface PepEinsatzkraft {
  id: string;
  name: string;
  taktisch: string[];
  medizinisch: string[];
  zusatz: string[];
  notiz: string | null;
  hiorgOrgId: string | null;
  telefonnummer: string | null;
  /** Optional, damit gespeicherte Altbestände gültig bleiben. */
  kuerzel?: string | null;
}
export interface PepInhalt {
  beschreibung: string;
  posten: PepPosten[];
  einsatzkraefte: PepEinsatzkraft[];
  einsatzleiterId: string | null;
}
export interface PepVorlageInhalt {
  beschreibung: string;
  posten: PepPosten[];
}
export interface Pep {
  schema: 1;
  vorlageId: string | null;
  inhalt: PepInhalt;
}
export interface PepVorlage {
  id: string;
  titel: string;
  inhalt: PepVorlageInhalt;
}
export interface PepKennzahlen {
  posten: number;
  positionen: number;
  besetzt: number;
  einsatzkraefte: number;
}

function istKennung(wert: unknown): wert is string {
  return istNichtleererText(wert) && wert.length <= PEP_ID_MAX;
}

function istTextOderNull(wert: unknown, max: number): wert is string | null {
  return wert === null || istText0bis(wert, max);
}

function istWertAus(wert: unknown, erlaubt: readonly string[]): wert is string {
  return istText(wert) && erlaubt.includes(wert);
}

function pruefeAnforderungen(wert: unknown): PepAnforderungen | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['taktisch', 'medizinisch', 'zusatz']) ||
    !(wert['taktisch'] === null || istWertAus(wert['taktisch'], TAKTISCH_WERTE)) ||
    !(wert['medizinisch'] === null || istWertAus(wert['medizinisch'], MEDIZINISCH_WERTE)) ||
    !istTextOderNull(wert['zusatz'], PEP_ZUSATZ_MAX)
  ) {
    return null;
  }
  return { taktisch: wert['taktisch'], medizinisch: wert['medizinisch'], zusatz: wert['zusatz'] };
}

function pruefeFahrzeug(wert: unknown): PepFahrzeug | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['funkruf', 'seriennummer', 'hiorgId']) ||
    !istText0bis(wert['funkruf'], TEXT_MAX) ||
    !istTextOderNull(wert['seriennummer'], TEXT_MAX) ||
    !istTextOderNull(wert['hiorgId'], PEP_ID_MAX)
  ) {
    return null;
  }
  return {
    funkruf: wert['funkruf'],
    seriennummer: wert['seriennummer'],
    hiorgId: wert['hiorgId'],
  };
}

function pruefePosition(
  wert: unknown,
  positionsIds: Set<string>,
  vorlage: boolean,
): PepPosition | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, [
      'id',
      'bezeichnung',
      'anforderungen',
      'postenfuehrer',
      'einsatzkraftId',
    ]) ||
    !istKennung(wert['id']) ||
    positionsIds.has(wert['id']) ||
    !istText0bis(wert['bezeichnung'], TEXT_MAX) ||
    typeof wert['postenfuehrer'] !== 'boolean' ||
    !(wert['einsatzkraftId'] === null || (!vorlage && istKennung(wert['einsatzkraftId'])))
  ) {
    return null;
  }
  const anforderungen = pruefeAnforderungen(wert['anforderungen']);
  if (!anforderungen) return null;
  positionsIds.add(wert['id']);
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    anforderungen,
    postenfuehrer: wert['postenfuehrer'],
    einsatzkraftId: wert['einsatzkraftId'],
  };
}

function pruefePosten(
  wert: unknown,
  postenIds: Set<string>,
  positionsIds: Set<string>,
  vorlage: boolean,
): PepPosten | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, [
      'id',
      'bezeichnung',
      'fahrzeug',
      'telefonnummer',
      'hiorgSchichtId',
      'positionen',
    ]) ||
    !istKennung(wert['id']) ||
    postenIds.has(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    wert['bezeichnung'].length > TEXT_MAX ||
    !istTextOderNull(wert['telefonnummer'], PEP_TELEFON_MAX) ||
    !istTextOderNull(wert['hiorgSchichtId'], PEP_ID_MAX) ||
    !Array.isArray(wert['positionen']) ||
    wert['positionen'].length > MAX_PEP_POSITIONEN_JE_POSTEN
  ) {
    return null;
  }
  const fahrzeug = wert['fahrzeug'] === null ? null : pruefeFahrzeug(wert['fahrzeug']);
  if (wert['fahrzeug'] !== null && !fahrzeug) return null;
  postenIds.add(wert['id']);
  const positionen: PepPosition[] = [];
  for (const roh of wert['positionen'] as unknown[]) {
    const position = pruefePosition(roh, positionsIds, vorlage);
    if (!position) return null;
    positionen.push(position);
  }
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    fahrzeug,
    telefonnummer: wert['telefonnummer'],
    hiorgSchichtId: wert['hiorgSchichtId'],
    positionen,
  };
}

function pruefePostenListe(wert: unknown, vorlage: boolean): PepPosten[] | null {
  if (!Array.isArray(wert) || wert.length > MAX_PEP_POSTEN) return null;
  const postenIds = new Set<string>();
  const positionsIds = new Set<string>();
  const posten: PepPosten[] = [];
  for (const roh of wert as unknown[]) {
    const geprueft = pruefePosten(roh, postenIds, positionsIds, vorlage);
    if (!geprueft) return null;
    posten.push(geprueft);
  }
  return posten;
}

function pruefeWerteListe(wert: unknown, erlaubt: readonly string[]): string[] | null {
  if (!Array.isArray(wert) || wert.length > erlaubt.length) return null;
  if (!wert.every((eintrag) => istWertAus(eintrag, erlaubt))) return null;
  return [...(wert as string[])];
}

function pruefeEinsatzkraft(wert: unknown, ids: Set<string>): PepEinsatzkraft | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, [
      'id',
      'name',
      'taktisch',
      'medizinisch',
      'zusatz',
      'notiz',
      'hiorgOrgId',
      'telefonnummer',
      'kuerzel',
    ]) ||
    !istKennung(wert['id']) ||
    ids.has(wert['id']) ||
    !istNichtleererText(wert['name']) ||
    wert['name'].length > TEXT_MAX ||
    !Array.isArray(wert['zusatz']) ||
    wert['zusatz'].length > PEP_ZUSATZ_JE_KRAFT_MAX ||
    !wert['zusatz'].every((eintrag) => istText0bis(eintrag, 100)) ||
    !istTextOderNull(wert['notiz'], PEP_NOTIZ_MAX) ||
    !istTextOderNull(wert['hiorgOrgId'], PEP_ID_MAX) ||
    !istTextOderNull(wert['telefonnummer'], PEP_TELEFON_MAX) ||
    !(wert['kuerzel'] === undefined || istTextOderNull(wert['kuerzel'], PEP_KUERZEL_MAX))
  ) {
    return null;
  }
  const taktisch = pruefeWerteListe(wert['taktisch'], TAKTISCH_WERTE);
  const medizinisch = pruefeWerteListe(wert['medizinisch'], MEDIZINISCH_WERTE);
  if (!taktisch || !medizinisch) return null;
  ids.add(wert['id']);
  return {
    id: wert['id'],
    name: wert['name'],
    taktisch,
    medizinisch,
    zusatz: [...(wert['zusatz'] as string[])],
    notiz: wert['notiz'],
    hiorgOrgId: wert['hiorgOrgId'],
    telefonnummer: wert['telefonnummer'],
    ...(typeof wert['kuerzel'] === 'string' ? { kuerzel: wert['kuerzel'] } : {}),
  };
}

export function pruefePepInhalt(wert: unknown): PepInhalt | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['beschreibung', 'posten', 'einsatzkraefte', 'einsatzleiterId']) ||
    !istText0bis(wert['beschreibung'], PEP_BESCHREIBUNG_MAX) ||
    !Array.isArray(wert['einsatzkraefte']) ||
    wert['einsatzkraefte'].length > MAX_PEP_EINSATZKRAEFTE ||
    !(wert['einsatzleiterId'] === null || istKennung(wert['einsatzleiterId']))
  ) {
    return null;
  }
  const posten = pruefePostenListe(wert['posten'], false);
  if (!posten) return null;
  const kraftIds = new Set<string>();
  const einsatzkraefte: PepEinsatzkraft[] = [];
  for (const roh of wert['einsatzkraefte'] as unknown[]) {
    const kraft = pruefeEinsatzkraft(roh, kraftIds);
    if (!kraft) return null;
    einsatzkraefte.push(kraft);
  }
  // Verweise statt Kopien: jede Zuordnung und die Einsatzleitung zeigen auf eine Einsatzkraft.
  if (wert['einsatzleiterId'] !== null && !kraftIds.has(wert['einsatzleiterId'])) return null;
  for (const einzelposten of posten) {
    for (const position of einzelposten.positionen) {
      if (position.einsatzkraftId !== null && !kraftIds.has(position.einsatzkraftId)) return null;
    }
  }
  return {
    beschreibung: wert['beschreibung'],
    posten,
    einsatzkraefte,
    einsatzleiterId: wert['einsatzleiterId'],
  };
}

export function pruefePepVorlageInhalt(wert: unknown): PepVorlageInhalt | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['beschreibung', 'posten']) ||
    !istText0bis(wert['beschreibung'], PEP_BESCHREIBUNG_MAX)
  ) {
    return null;
  }
  const posten = pruefePostenListe(wert['posten'], true);
  if (!posten) return null;
  return { beschreibung: wert['beschreibung'], posten };
}

export function pruefePep(wert: unknown): Pep | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['schema', 'vorlageId', 'inhalt']) ||
    wert['schema'] !== 1 ||
    !istUuidOderNull(wert['vorlageId'])
  ) {
    return null;
  }
  const inhalt = pruefePepInhalt(wert['inhalt']);
  if (!inhalt) return null;
  return { schema: 1, vorlageId: wert['vorlageId'], inhalt };
}

export function pruefePepVorlage(wert: unknown): PepVorlage | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['id', 'titel', 'inhalt']) ||
    !istUuid(wert['id']) ||
    !istNichtleererText(wert['titel']) ||
    wert['titel'].length > TEXT_MAX
  ) {
    return null;
  }
  const inhalt = pruefePepVorlageInhalt(wert['inhalt']);
  if (!inhalt) return null;
  return { id: wert['id'], titel: wert['titel'], inhalt };
}

/** Kennzahlen setzt ausschließlich der Worker, nie der Anfragekörper. */
export function zaehlePep(inhalt: PepInhalt | PepVorlageInhalt): PepKennzahlen {
  let positionen = 0;
  let besetzt = 0;
  for (const posten of inhalt.posten) {
    positionen += posten.positionen.length;
    for (const position of posten.positionen) if (position.einsatzkraftId !== null) besetzt += 1;
  }
  return {
    posten: inhalt.posten.length,
    positionen,
    besetzt,
    einsatzkraefte: 'einsatzkraefte' in inhalt ? inhalt.einsatzkraefte.length : 0,
  };
}
