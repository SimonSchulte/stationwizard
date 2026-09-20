/**
 * Gemeinsame Prüfprimitive für unbekannte externe Daten (Worker-Antworten,
 * Datei-Importe), bevor sie als Domänentyp weiterverwendet werden. Vorher in
 * jeder `*-pruefung.ts`-Datei einzeln definiert; hier gebündelt, analog zu
 * `worker/src/json-lesen.ts` auf der Worker-Seite. Rein strukturelle
 * Prüfungen ohne Fachbezug – keine Vereinheitlichung von Domänenmodellen.
 */

export function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

export function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

export function istNichtleererText(wert: unknown): wert is string {
  return istText(wert) && wert.trim().length > 0;
}
