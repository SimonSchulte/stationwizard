import {
  ARTIKEL_EINHEITEN,
  Artikel,
  ArtikelEinheit,
  Kiste,
  KistenPosition,
  Lager,
} from '../models/stammdaten.model';

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string' && wert !== '';
}

function istVerwaltungsfeld(wert: Record<string, unknown>): boolean {
  return (
    typeof wert['version'] === 'number' &&
    Number.isInteger(wert['version']) &&
    wert['version'] >= 1 &&
    typeof wert['geaendertAm'] === 'string' &&
    typeof wert['geaendertVon'] === 'string'
  );
}

export function istArtikelEinheit(wert: unknown): wert is ArtikelEinheit {
  return typeof wert === 'string' && (ARTIKEL_EINHEITEN as readonly string[]).includes(wert);
}

/** Prüft eine Lagerzeile aus der Worker-Antwort, bevor sie in ein Domänenmodell gelangt. */
export function istLager(wert: unknown): wert is Lager {
  return (
    istObjekt(wert) &&
    istText(wert['id']) &&
    istText(wert['name']) &&
    typeof wert['reihenfolge'] === 'number' &&
    Number.isInteger(wert['reihenfolge']) &&
    istVerwaltungsfeld(wert)
  );
}

export function istArtikel(wert: unknown): wert is Artikel {
  return (
    istObjekt(wert) &&
    istText(wert['id']) &&
    istText(wert['name']) &&
    istArtikelEinheit(wert['einheit']) &&
    (wert['lagerId'] === null || istText(wert['lagerId'])) &&
    istVerwaltungsfeld(wert)
  );
}

export function istKistenPosition(wert: unknown): wert is KistenPosition {
  return (
    istObjekt(wert) &&
    istText(wert['artikelId']) &&
    typeof wert['menge'] === 'number' &&
    Number.isFinite(wert['menge']) &&
    wert['menge'] > 0 &&
    typeof wert['bemerkung'] === 'string'
  );
}

export function istKiste(wert: unknown): wert is Kiste {
  return (
    istObjekt(wert) &&
    istText(wert['id']) &&
    istText(wert['name']) &&
    (wert['lagerId'] === null || istText(wert['lagerId'])) &&
    Array.isArray(wert['inhalt']) &&
    wert['inhalt'].every(istKistenPosition) &&
    istVerwaltungsfeld(wert)
  );
}

/** Menge laut Vertrag: größer 0, höchstens drei Nachkommastellen, nicht über die Obergrenze. */
export function istGueltigeMenge(menge: number): boolean {
  if (!Number.isFinite(menge) || menge <= 0 || menge > 1_000_000) return false;
  const tausendstel = menge * 1000;
  return Math.abs(tausendstel - Math.round(tausendstel)) < 1e-6;
}
