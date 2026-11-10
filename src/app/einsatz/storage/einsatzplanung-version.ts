/**
 * Liest die ganze Versionsnummer aus einem ETag (`"3"` oder `W/"3"`). `null`, wenn der
 * Wert keine positive ganze Zahl ist. Für `Aufbau.vorlageVersion`.
 */
export function versionAlsZahl(etag: string): number | null {
  const treffer = /^(?:W\/)?"(\d+)"$/.exec(etag.trim());
  if (!treffer) return null;
  const zahl = Number(treffer[1]);
  return Number.isSafeInteger(zahl) && zahl > 0 ? zahl : null;
}
