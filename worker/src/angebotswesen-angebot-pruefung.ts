import { ISO_DATUM, PREISKATALOG_ARTEN, zeitAlsMinuten } from './angebotswesen-gemeinsam';
import { istNichtleererText, istObjekt, istText, UUID_REGEX } from './json-lesen';

/** Prüfung eines eingereichten Angebots samt Schichten, Positionen und Pauschalen. */

interface PositionEingabe {
  id: string;
  herkunftEintragId: string | null;
  art: string;
  bezeichnung: string;
  einzelpreisCent: number;
  anzahl: number;
  stunden: number | null;
}

function pruefePosition(wert: unknown): PositionEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !(wert['herkunftEintragId'] === null || istNichtleererText(wert['herkunftEintragId'])) ||
    !istText(wert['art']) ||
    !PREISKATALOG_ARTEN.has(wert['art']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    typeof wert['einzelpreisCent'] !== 'number' ||
    !Number.isInteger(wert['einzelpreisCent']) ||
    wert['einzelpreisCent'] < 0 ||
    typeof wert['anzahl'] !== 'number' ||
    !Number.isInteger(wert['anzahl']) ||
    wert['anzahl'] < 1
  ) {
    return null;
  }
  const art = wert['art'];
  const stunden = wert['stunden'];
  if (art === 'fahrzeug') {
    if (stunden !== null) return null;
  } else {
    if (typeof stunden !== 'number' || !Number.isFinite(stunden) || stunden <= 0) return null;
  }
  return {
    id: wert['id'],
    herkunftEintragId: istText(wert['herkunftEintragId']) ? wert['herkunftEintragId'] : null,
    art,
    bezeichnung: wert['bezeichnung'],
    einzelpreisCent: wert['einzelpreisCent'],
    anzahl: wert['anzahl'],
    stunden: art === 'fahrzeug' ? null : (stunden as number),
  };
}

interface SchichtEingabe {
  id: string;
  datum: string;
  von: string;
  bis: string;
  positionen: PositionEingabe[];
}

function pruefeSchicht(wert: unknown): SchichtEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !istText(wert['datum']) ||
    !ISO_DATUM.test(wert['datum']) ||
    !istText(wert['von']) ||
    !istText(wert['bis']) ||
    !Array.isArray(wert['positionen'])
  ) {
    return null;
  }
  const vonMin = zeitAlsMinuten(wert['von']);
  const bisMin = zeitAlsMinuten(wert['bis']);
  if (vonMin === null || bisMin === null || bisMin <= vonMin) return null;
  const positionen = wert['positionen'].map(pruefePosition);
  if (positionen.some((p) => p === null)) return null;
  return {
    id: wert['id'],
    datum: wert['datum'],
    von: wert['von'],
    bis: wert['bis'],
    positionen: positionen as PositionEingabe[],
  };
}

interface AngebotEingabe {
  id: string;
  bezeichnung: string;
  auftraggeber: string;
  bemerkung: string;
  schichten: SchichtEingabe[];
  materialpauschaleAktiv: boolean;
  materialpauschaleCent: number | null;
  pauschalpreisAktiv: boolean;
  pauschalpreisCent: number | null;
}

/**
 * Prüft ein `<x>Aktiv`/`<x>Cent`-Wertepaar: bei aktivem Flag ist der Cent-Wert
 * Pflicht (Ganzzahl >= 0), sonst optional (fehlend/`null` oder Ganzzahl >= 0).
 * Gemeinsam für Materialpauschale und Pauschalpreis, die derselben Regel folgen.
 */
function pruefePauschale(aktiv: unknown, centRoh: unknown): { cent: number | null } | null {
  if (typeof aktiv !== 'boolean') return null;
  if (aktiv) {
    if (typeof centRoh !== 'number' || !Number.isInteger(centRoh) || centRoh < 0) return null;
    return { cent: centRoh };
  }
  if (
    centRoh !== null &&
    !(typeof centRoh === 'number' && Number.isInteger(centRoh) && centRoh >= 0)
  ) {
    return null;
  }
  return { cent: centRoh === undefined ? null : (centRoh as number) };
}

export function pruefeAngebotEingabe(wert: unknown): AngebotEingabe | null {
  if (
    !istObjekt(wert) ||
    !istNichtleererText(wert['id']) ||
    !UUID_REGEX.test(wert['id']) ||
    !istNichtleererText(wert['bezeichnung']) ||
    !istText(wert['auftraggeber']) ||
    !istText(wert['bemerkung']) ||
    !Array.isArray(wert['schichten'])
  ) {
    return null;
  }
  const schichten = wert['schichten'].map(pruefeSchicht);
  if (schichten.some((s) => s === null)) return null;
  const materialpauschale = pruefePauschale(
    wert['materialpauschaleAktiv'],
    wert['materialpauschaleCent'],
  );
  const pauschalpreis = pruefePauschale(wert['pauschalpreisAktiv'], wert['pauschalpreisCent']);
  if (!materialpauschale || !pauschalpreis) return null;
  return {
    id: wert['id'],
    bezeichnung: wert['bezeichnung'],
    auftraggeber: wert['auftraggeber'],
    bemerkung: wert['bemerkung'],
    schichten: schichten as SchichtEingabe[],
    materialpauschaleAktiv: wert['materialpauschaleAktiv'] as boolean,
    materialpauschaleCent: materialpauschale.cent,
    pauschalpreisAktiv: wert['pauschalpreisAktiv'] as boolean,
    pauschalpreisCent: pauschalpreis.cent,
  };
}
