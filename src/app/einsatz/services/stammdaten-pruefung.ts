import { ARTIKEL_EINHEITEN, Artikel, ArtikelEinheit, Lager } from '../models/stammdaten.model';

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
