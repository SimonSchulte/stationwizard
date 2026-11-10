import {
  ABSCHNITT_FARBEN,
  ANWEISUNGEN_MAX,
  FOTO_MAX,
  FOTO_MUSTER,
  TEXT_MAX,
} from './einsatzplanung-gemeinsam';
import { hatNurFelder, istText0bis, istUuid, istUuidOderNull } from './einsatzplanung-pruefung';
import {
  BEMERKUNG_MAX,
  istMenge,
  MAX_KISTEN_POSITIONEN,
  NAME_MAX,
} from './einsatzplanung-stammdaten';
import { istNichtleererText, istObjekt, istText } from './json-lesen';

/**
 * Strikte Prüfung des Aufbaus (Konzept `docs/konzept-packeinheiten.md`, Abschnitt 4): unbekannte
 * Felder abgelehnt, Ids im gesamten Inhalt eindeutig, Grenzen eingehalten. Ob die Verweise auf Artikel
 * und Lager existieren, prüft der Aufrufer gegen die Datenbank (`sammleVerweise()`).
 */

export const AUFBAU_KOERPER_GRENZE = 1024 * 1024;
export const MAX_EINHEITEN = 60;
export const MAX_EINTRAEGE_JE_EINHEIT = 200;
export const MAX_KISTEN_ANZAHL = 99;
export const EINHEIT_ANWEISUNG_MAX = 2000;

export type AufbauPhase = 'vorher' | 'zum-schluss';
export type EinheitTyp = 'fahrzeug' | 'wagen';

export interface AufbauArtikelEintrag {
  art: 'artikel';
  id: string;
  artikelId: string;
  menge: number;
  bemerkung: string;
  lagerId: string | null;
  phase: AufbauPhase | null;
}
/** Freier Artikel: Name und Einheit stehen im Aufbau selbst, ohne Artikelkatalog und Lager. */
export interface AufbauFreierEintrag {
  art: 'frei';
  id: string;
  name: string;
  einheit: string;
  menge: number;
  bemerkung: string;
  phase: AufbauPhase | null;
}
export const FREI_EINHEIT_MAX = 20;
export interface AufbauKistenPosition {
  artikelId: string;
  menge: number;
  bemerkung: string;
}
export interface AufbauKistenEintrag {
  art: 'kiste';
  id: string;
  /** Nur zur Nachverfolgung; die Kiste darf in den Stammdaten inzwischen fehlen. */
  kisteId: string | null;
  name: string;
  lagerId: string | null;
  anzahl: number;
  inhalt: AufbauKistenPosition[];
  phase: AufbauPhase | null;
}
export interface AufbauWagenEintrag {
  art: 'wagen';
  id: string;
  einheit: AufbauEinheit;
}
export type AufbauEintrag =
  AufbauArtikelEintrag | AufbauFreierEintrag | AufbauKistenEintrag | AufbauWagenEintrag;

export interface AufbauEinheit {
  id: string;
  typ: EinheitTyp;
  name: string;
  farbe: string;
  /** JPEG-Data-URL; fehlt, wenn es kein Foto gibt. */
  foto?: string;
  anweisung: string;
  bemerkung: string;
  inhalt: AufbauEintrag[];
}
export interface AufbauInhalt {
  anweisungen: string;
  einheiten: AufbauEinheit[];
}
export interface Aufbau {
  vorlageId: string | null;
  vorlageVersion: number | null;
  inhalt: AufbauInhalt;
}
export interface AufbauVorlage {
  id: string;
  titel: string;
  inhalt: AufbauInhalt;
}
export interface AufbauKennzahlen {
  einheiten: number;
  kisten: number;
  positionen: number;
}
export interface AufbauVerweise {
  artikelIds: Set<string>;
  lagerIds: Set<string>;
}

interface Zaehler {
  ids: Set<string>;
  einheiten: number;
}

function pruefePhase(wert: unknown): AufbauPhase | null | undefined {
  if (wert === null) return null;
  return wert === 'vorher' || wert === 'zum-schluss' ? wert : undefined;
}

function pruefeEindeutigeId(wert: unknown, z: Zaehler): string | null {
  if (!istUuid(wert)) return null;
  const id = wert.toLowerCase();
  if (z.ids.has(id)) return null;
  z.ids.add(id);
  return id;
}

function kleinOderNull(wert: string | null): string | null {
  return wert === null ? null : wert.toLowerCase();
}

function pruefeKistenPositionen(wert: unknown): AufbauKistenPosition[] | null {
  if (!Array.isArray(wert) || wert.length > MAX_KISTEN_POSITIONEN) return null;
  const gesehen = new Set<string>();
  const ergebnis: AufbauKistenPosition[] = [];
  for (const p of wert) {
    if (!istObjekt(p) || !hatNurFelder(p, ['artikelId', 'menge', 'bemerkung'])) return null;
    if (!istUuid(p['artikelId']) || !istMenge(p['menge'])) return null;
    if (!istText0bis(p['bemerkung'], BEMERKUNG_MAX)) return null;
    const artikelId = p['artikelId'].toLowerCase();
    if (gesehen.has(artikelId)) return null;
    gesehen.add(artikelId);
    ergebnis.push({ artikelId, menge: p['menge'], bemerkung: p['bemerkung'].trim() });
  }
  return ergebnis;
}

function pruefeEintrag(wert: unknown, z: Zaehler, inFahrzeug: boolean): AufbauEintrag | null {
  if (!istObjekt(wert)) return null;
  if (wert['art'] === 'artikel') {
    if (!hatNurFelder(wert, ['art', 'id', 'artikelId', 'menge', 'bemerkung', 'lagerId', 'phase'])) {
      return null;
    }
    const id = pruefeEindeutigeId(wert['id'], z);
    const phase = pruefePhase(wert['phase']);
    if (
      !id ||
      !istUuid(wert['artikelId']) ||
      !istMenge(wert['menge']) ||
      !istText0bis(wert['bemerkung'], BEMERKUNG_MAX) ||
      !istUuidOderNull(wert['lagerId']) ||
      phase === undefined
    ) {
      return null;
    }
    return {
      art: 'artikel',
      id,
      artikelId: wert['artikelId'].toLowerCase(),
      menge: wert['menge'],
      bemerkung: wert['bemerkung'].trim(),
      lagerId: kleinOderNull(wert['lagerId']),
      phase,
    };
  }
  if (wert['art'] === 'frei') {
    if (!hatNurFelder(wert, ['art', 'id', 'name', 'einheit', 'menge', 'bemerkung', 'phase'])) {
      return null;
    }
    const id = pruefeEindeutigeId(wert['id'], z);
    const phase = pruefePhase(wert['phase']);
    if (
      !id ||
      !istNichtleererText(wert['name']) ||
      wert['name'].trim().length > NAME_MAX ||
      !istText0bis(wert['einheit'], FREI_EINHEIT_MAX) ||
      !istMenge(wert['menge']) ||
      !istText0bis(wert['bemerkung'], BEMERKUNG_MAX) ||
      phase === undefined
    ) {
      return null;
    }
    return {
      art: 'frei',
      id,
      name: wert['name'].trim().replace(/\s+/g, ' '),
      einheit: wert['einheit'].trim(),
      menge: wert['menge'],
      bemerkung: wert['bemerkung'].trim(),
      phase,
    };
  }
  if (wert['art'] === 'kiste') {
    if (
      !hatNurFelder(wert, ['art', 'id', 'kisteId', 'name', 'lagerId', 'anzahl', 'inhalt', 'phase'])
    ) {
      return null;
    }
    const id = pruefeEindeutigeId(wert['id'], z);
    const phase = pruefePhase(wert['phase']);
    const anzahl = wert['anzahl'];
    const inhalt = pruefeKistenPositionen(wert['inhalt']);
    if (
      !id ||
      !istUuidOderNull(wert['kisteId']) ||
      !istNichtleererText(wert['name']) ||
      wert['name'].trim().length > NAME_MAX ||
      !istUuidOderNull(wert['lagerId']) ||
      typeof anzahl !== 'number' ||
      !Number.isInteger(anzahl) ||
      anzahl < 1 ||
      anzahl > MAX_KISTEN_ANZAHL ||
      !inhalt ||
      phase === undefined
    ) {
      return null;
    }
    return {
      art: 'kiste',
      id,
      kisteId: kleinOderNull(wert['kisteId']),
      name: wert['name'].trim().replace(/\s+/g, ' '),
      lagerId: kleinOderNull(wert['lagerId']),
      anzahl,
      inhalt,
      phase,
    };
  }
  if (wert['art'] === 'wagen') {
    // Ein Wagen steht nur direkt in einem Fahrzeug, nie in einem Wagen und nie verschachtelt.
    if (!inFahrzeug || !hatNurFelder(wert, ['art', 'id', 'einheit'])) return null;
    const id = pruefeEindeutigeId(wert['id'], z);
    const einheit = pruefeEinheit(wert['einheit'], z, false);
    if (!id || !einheit || einheit.typ !== 'wagen') return null;
    return { art: 'wagen', id, einheit };
  }
  return null;
}

function pruefeEinheit(wert: unknown, z: Zaehler, oberste: boolean): AufbauEinheit | null {
  if (
    !istObjekt(wert) ||
    !hatNurFelder(wert, ['id', 'typ', 'name', 'farbe', 'foto', 'anweisung', 'bemerkung', 'inhalt'])
  ) {
    return null;
  }
  z.einheiten += 1;
  if (z.einheiten > MAX_EINHEITEN) return null;
  const id = pruefeEindeutigeId(wert['id'], z);
  const typ = wert['typ'];
  if (typ !== 'fahrzeug' && typ !== 'wagen') return null;
  if (!oberste && typ !== 'wagen') return null;
  const farbe = wert['farbe'];
  const foto = wert['foto'];
  if (
    !id ||
    !istNichtleererText(wert['name']) ||
    wert['name'].trim().length > NAME_MAX ||
    !istText(farbe) ||
    !ABSCHNITT_FARBEN.has(farbe) ||
    !istText0bis(wert['anweisung'], EINHEIT_ANWEISUNG_MAX) ||
    !istText0bis(wert['bemerkung'], TEXT_MAX) ||
    (foto !== undefined && (!istText(foto) || foto.length > FOTO_MAX || !FOTO_MUSTER.test(foto))) ||
    !Array.isArray(wert['inhalt']) ||
    wert['inhalt'].length > MAX_EINTRAEGE_JE_EINHEIT
  ) {
    return null;
  }
  const inhalt: AufbauEintrag[] = [];
  for (const roh of wert['inhalt']) {
    const eintrag = pruefeEintrag(roh, z, typ === 'fahrzeug');
    if (!eintrag) return null;
    inhalt.push(eintrag);
  }
  const einheit: AufbauEinheit = {
    id,
    typ,
    name: wert['name'].trim().replace(/\s+/g, ' '),
    farbe,
    anweisung: wert['anweisung'].trim(),
    bemerkung: wert['bemerkung'].trim(),
    inhalt,
  };
  if (foto !== undefined) einheit.foto = foto as string;
  return einheit;
}

export function pruefeAufbauInhalt(wert: unknown): AufbauInhalt | null {
  if (!istObjekt(wert) || !hatNurFelder(wert, ['anweisungen', 'einheiten'])) return null;
  if (!istText0bis(wert['anweisungen'], ANWEISUNGEN_MAX)) return null;
  const roh = wert['einheiten'];
  if (!Array.isArray(roh) || roh.length > MAX_EINHEITEN) return null;
  const z: Zaehler = { ids: new Set(), einheiten: 0 };
  const einheiten: AufbauEinheit[] = [];
  for (const e of roh) {
    const einheit = pruefeEinheit(e, z, true);
    if (!einheit) return null;
    einheiten.push(einheit);
  }
  return { anweisungen: wert['anweisungen'].trim(), einheiten };
}

export function pruefeAufbau(wert: unknown): Aufbau | null {
  if (!istObjekt(wert) || !hatNurFelder(wert, ['vorlageId', 'vorlageVersion', 'inhalt'])) {
    return null;
  }
  const version = wert['vorlageVersion'];
  if (
    !istUuidOderNull(wert['vorlageId']) ||
    !(
      version === null ||
      (typeof version === 'number' && Number.isSafeInteger(version) && version >= 1)
    )
  ) {
    return null;
  }
  const inhalt = pruefeAufbauInhalt(wert['inhalt']);
  if (!inhalt) return null;
  return { vorlageId: kleinOderNull(wert['vorlageId']), vorlageVersion: version, inhalt };
}

export function pruefeAufbauVorlage(wert: unknown): AufbauVorlage | null {
  if (!istObjekt(wert) || !hatNurFelder(wert, ['id', 'titel', 'inhalt'])) return null;
  if (
    !istUuid(wert['id']) ||
    !istNichtleererText(wert['titel']) ||
    wert['titel'].length > TEXT_MAX
  ) {
    return null;
  }
  const inhalt = pruefeAufbauInhalt(wert['inhalt']);
  if (!inhalt) return null;
  return { id: wert['id'].toLowerCase(), titel: wert['titel'].trim(), inhalt };
}

function alleEinheiten(inhalt: AufbauInhalt): AufbauEinheit[] {
  const liste: AufbauEinheit[] = [];
  for (const einheit of inhalt.einheiten) {
    liste.push(einheit);
    for (const eintrag of einheit.inhalt) if (eintrag.art === 'wagen') liste.push(eintrag.einheit);
  }
  return liste;
}

export function zaehleAufbau(inhalt: AufbauInhalt): AufbauKennzahlen {
  let kisten = 0;
  let positionen = 0;
  const einheiten = alleEinheiten(inhalt);
  for (const einheit of einheiten) {
    for (const eintrag of einheit.inhalt) {
      if (eintrag.art === 'kiste') {
        kisten += eintrag.anzahl;
        positionen += eintrag.inhalt.length;
      } else if (eintrag.art === 'artikel' || eintrag.art === 'frei') {
        positionen += 1;
      }
    }
  }
  return { einheiten: einheiten.length, kisten, positionen };
}

/** Alle Artikel- und Lager-Ids, auf die der Inhalt verweist (für die Prüfung gegen die Datenbank). */
export function sammleVerweise(inhalt: AufbauInhalt): AufbauVerweise {
  const artikelIds = new Set<string>();
  const lagerIds = new Set<string>();
  for (const einheit of alleEinheiten(inhalt)) {
    for (const eintrag of einheit.inhalt) {
      if (eintrag.art === 'artikel') {
        artikelIds.add(eintrag.artikelId);
        if (eintrag.lagerId) lagerIds.add(eintrag.lagerId);
      } else if (eintrag.art === 'kiste') {
        for (const p of eintrag.inhalt) artikelIds.add(p.artikelId);
        if (eintrag.lagerId) lagerIds.add(eintrag.lagerId);
      }
    }
  }
  return { artikelIds, lagerIds };
}
