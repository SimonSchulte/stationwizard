import {
  Einsatzkraft,
  EinsatzkraftRef,
  FahrzeugRef,
  MEDIZINISCH_ORDER,
  PepFile,
  Planung,
  Position,
  Posten,
  TAKTISCH_ORDER,
} from '../models/planung.model';
import { formatiereTaktischeZeit } from '../../kern/kalender/taktische-zeit';

export const PEP_DATEIVERSION = '1.0';

export interface PepLadeErgebnis {
  planung: Planung;
  versionWarning: boolean;
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istKennung(wert: unknown): wert is string {
  return istText(wert) && wert.trim().length > 0;
}

function optionalerText(wert: unknown): boolean {
  return wert === undefined || istText(wert);
}

function istReferenz(wert: unknown): wert is EinsatzkraftRef {
  return istObjekt(wert) && istKennung(wert['id']) && istText(wert['name']);
}

function istFahrzeug(wert: unknown): wert is FahrzeugRef {
  return (
    istObjekt(wert) &&
    istText(wert['funkruf']) &&
    (wert['seriennummer'] === null || istText(wert['seriennummer'])) &&
    (wert['hiorgId'] === null || istText(wert['hiorgId']))
  );
}

function istTextliste(wert: unknown, erlaubteWerte?: readonly string[]): boolean {
  return (
    wert === undefined ||
    (Array.isArray(wert) &&
      wert.every(
        (eintrag: unknown) =>
          istText(eintrag) && (!erlaubteWerte || erlaubteWerte.includes(eintrag)),
      ))
  );
}

function istEinsatzkraft(wert: unknown): wert is Einsatzkraft {
  if (
    !istObjekt(wert) ||
    !istKennung(wert['id']) ||
    !istText(wert['name']) ||
    !istObjekt(wert['tags'])
  )
    return false;
  const tags = wert['tags'];
  return (
    istTextliste(tags['taktisch'], TAKTISCH_ORDER) &&
    istTextliste(tags['medizinisch'], MEDIZINISCH_ORDER) &&
    istTextliste(tags['zusatz']) &&
    optionalerText(wert['hiorg_org_id']) &&
    optionalerText(wert['telefonnummer']) &&
    (wert['meta'] === undefined ||
      (istObjekt(wert['meta']) && optionalerText(wert['meta']['notes'])))
  );
}

function istPosition(wert: unknown): wert is Position {
  if (
    !istObjekt(wert) ||
    !istKennung(wert['id']) ||
    !istText(wert['label']) ||
    !istObjekt(wert['requirements'])
  )
    return false;
  const anforderungen = wert['requirements'];
  const taktisch = anforderungen['taktisch'];
  const medizinisch = anforderungen['medizinisch'];
  return (
    (taktisch === null || (istText(taktisch) && TAKTISCH_ORDER.some((tag) => tag === taktisch))) &&
    (medizinisch === null ||
      (istText(medizinisch) && MEDIZINISCH_ORDER.some((tag) => tag === medizinisch))) &&
    (anforderungen['zusatz'] == null || istText(anforderungen['zusatz'])) &&
    (wert['assigned'] === null || istReferenz(wert['assigned'])) &&
    (wert['isPostenfuehrer'] === undefined || typeof wert['isPostenfuehrer'] === 'boolean')
  );
}

function istPosten(wert: unknown): wert is Posten {
  return (
    istObjekt(wert) &&
    istKennung(wert['id']) &&
    istText(wert['label']) &&
    (wert['fahrzeug'] === null || istFahrzeug(wert['fahrzeug'])) &&
    Array.isArray(wert['positions']) &&
    wert['positions'].every(istPosition) &&
    optionalerText(wert['hiorg_schicht_id']) &&
    optionalerText(wert['telefonnummer'])
  );
}

function sindKennungenEindeutig(werte: { id: string }[]): boolean {
  return new Set(werte.map((wert) => wert.id)).size === werte.length;
}

function istPlanung(wert: unknown): wert is Planung {
  if (
    !istObjekt(wert) ||
    !istKennung(wert['id']) ||
    !istText(wert['name']) ||
    !istText(wert['start']) ||
    !istText(wert['end']) ||
    !Array.isArray(wert['einsatzkraefte']) ||
    !wert['einsatzkraefte'].every(istEinsatzkraft) ||
    !Array.isArray(wert['posten']) ||
    !wert['posten'].every(istPosten) ||
    !(wert['einsatzleiter'] === null || istReferenz(wert['einsatzleiter'])) ||
    !(wert['beschreibung'] == null || istText(wert['beschreibung'])) ||
    !optionalerText(wert['hiorg_einsatz_id'])
  )
    return false;
  const personen = wert['einsatzkraefte'];
  const posten = wert['posten'];
  const positionen = posten.flatMap((posten) => posten.positions);
  const personenIds = new Set(personen.map((person) => person.id));
  return (
    sindKennungenEindeutig(personen) &&
    sindKennungenEindeutig(posten) &&
    sindKennungenEindeutig(positionen) &&
    positionen.every((position) => !position.assigned || personenIds.has(position.assigned.id)) &&
    (wert['einsatzleiter'] === null || personenIds.has(wert['einsatzleiter'].id))
  );
}

function istPepDatei(wert: unknown): wert is PepFile {
  return (
    istObjekt(wert) &&
    istText(wert['version']) &&
    istObjekt(wert['meta']) &&
    istText(wert['meta']['exportedAt']) &&
    istText(wert['meta']['locale']) &&
    optionalerText(wert['meta']['taktischeZeit']) &&
    istPlanung(wert['planung'])
  );
}

export function lesePepDatei(text: string): PepLadeErgebnis {
  let datei: unknown;
  try {
    datei = JSON.parse(text);
  } catch {
    throw new Error('Die Einsatzplandatei enthält kein gültiges JSON.');
  }
  if (!istPepDatei(datei)) {
    throw new Error(
      'Die Einsatzplandatei enthält eine ungültige Struktur, Qualifikation oder Personenreferenz.',
    );
  }
  return { planung: datei.planung, versionWarning: datei.version !== PEP_DATEIVERSION };
}

export function serialisierePepDatei(planung: Planung, zeitpunkt = new Date()): string {
  if (!istPlanung(planung)) throw new Error('Die Einsatzplanung enthält ungültige Daten.');
  const datei: PepFile = {
    version: PEP_DATEIVERSION,
    meta: {
      exportedAt: zeitpunkt.toISOString(),
      taktischeZeit: formatiereTaktischeZeit(zeitpunkt),
      locale: 'de-DE',
    },
    planung,
  };
  return JSON.stringify(datei, null, 2);
}
