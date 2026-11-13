import { Injectable } from '@angular/core';
import { PacklisteZeile } from './packliste-import';

/** Kopfzeile finden und die Spalten nach ihrer Überschrift zuordnen (Reihenfolge und Zusätze egal). */
function spalte(kopf: readonly string[], ...namen: string[]): number {
  return kopf.findIndex((zelle) => namen.some((n) => zelle.startsWith(n)));
}

/**
 * Liest das erste Blatt einer Excel-Packliste (Spalten Anzahl, Material, Lagerort, Lagerplatz, Transport mit).
 * `@e965/xlsx` wird erst hier geladen; geworfen wird mit einer verständlichen Meldung, wenn Spalten fehlen.
 */
async function lesePackliste(datei: File): Promise<PacklisteZeile[]> {
  const XLSX = await import('@e965/xlsx');
  const mappe = XLSX.read(await datei.arrayBuffer(), { type: 'array' });
  const blatt = mappe.Sheets[mappe.SheetNames[0] ?? ''];
  if (!blatt) throw new Error('Die Datei enthält kein Tabellenblatt.');
  const zeilen = XLSX.utils.sheet_to_json<unknown[]>(blatt, { header: 1, raw: true, defval: '' });
  const text = (wert: unknown): string =>
    typeof wert === 'string' ? wert : wert == null ? '' : String(wert);
  const kopfIndex = zeilen.findIndex((z) =>
    z.some((zelle) => text(zelle).trim().toLowerCase() === 'material'),
  );
  if (kopfIndex < 0) throw new Error('Keine Kopfzeile mit der Spalte „Material“ gefunden.');
  const kopf = zeilen[kopfIndex]!.map((zelle) => text(zelle).trim().toLowerCase());
  const anzahl = spalte(kopf, 'anzahl');
  const material = spalte(kopf, 'material');
  const lagerort = spalte(kopf, 'lagerort');
  const lagerplatz = spalte(kopf, 'lagerplatz');
  const transport = spalte(kopf, 'transport mit');
  const fehlend = [
    ['Anzahl', anzahl],
    ['Lagerort', lagerort],
    ['Transport mit', transport],
  ]
    .filter(([, index]) => index === -1)
    .map(([name]) => name);
  if (fehlend.length > 0) throw new Error(`Es fehlen Spalten: ${fehlend.join(', ')}.`);
  return zeilen.slice(kopfIndex + 1).map((z, i) => ({
    zeile: kopfIndex + i + 2,
    anzahl: z[anzahl],
    material: text(z[material]),
    lagerort: text(z[lagerort]),
    lagerplatz: lagerplatz === -1 ? '' : text(z[lagerplatz]),
    transportMit: text(z[transport]),
  }));
}

/** Liest Excel-Packlisten; als Dienst, damit Tests die Datei ersetzen können. */
@Injectable({ providedIn: 'root' })
export class PacklisteLeser {
  lesen(datei: File): Promise<PacklisteZeile[]> {
    return lesePackliste(datei);
  }
}
