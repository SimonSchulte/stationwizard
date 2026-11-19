import { AufbauTabellenZeile, TABELLEN_KOPF } from './aufbau-tabelle';

export const AUFBAU_EXCEL_MEDIENTYP =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const BLATT_AUFBAU = 'Aufbau';
const BLATT_HINWEISE = 'Hinweise';

const HINWEISE: readonly string[] = [
  'Aufbau (Packliste) als Excel-Datei zum Bearbeiten',
  '',
  'Die Datei kann in der Aufbau-Ansicht über „Weitere Aktionen → Aus Excel einlesen“ wieder hochgeladen werden.',
  'Eingelesen wird nur der Arbeitsstand im Editor; gespeichert wird erst mit „Speichern“, und „Rückgängig“ macht den Import rückgängig.',
  '',
  'Spalten',
  'Ebene: Fahrzeug, Wagen, Artikel, Freier Artikel, Kiste oder Kistenposition.',
  'Fahrzeug / Wagen: bei Fahrzeug- und Wagenzeilen der Name der Einheit (hier umbenennen), bei allen anderen Zeilen die Einheit, in der der Eintrag steht.',
  '  Wagen im Fahrzeug: beide Spalten gefüllt. Freier Wagen: nur „Wagen“.',
  'Kiste: nur bei Kistenpositionen, Name der Kiste, zu der die Position gehört.',
  'Name: Artikel- beziehungsweise Kistenname. Ein Artikel, der im Artikelkatalog steht, wird dem Katalog zugeordnet, sonst ist er ein freier Artikel.',
  'Menge: bei Kisten die Anzahl der Kisten (ganze Zahl 1 bis 99).',
  'Maßeinheit: nur bei freien Artikeln und freien Kistenpositionen wirksam; Katalogartikel tragen die Einheit des Katalogs.',
  'Lager / Platz: Namen aus den Stammdaten; ein unbekanntes Lager wird nicht übernommen.',
  'Phase: leer, vorher oder zum Schluss.',
  'Standard-Kiste: „ja“ bei einer Kiste ohne aufgelisteten Inhalt.',
  'ID: nicht ändern. Sie ordnet die Zeile dem bisherigen Eintrag zu (Farbe, Foto und Anweisung der Einheiten bleiben so erhalten).',
  '',
  'Bearbeiten',
  'Ändern: Werte in der Zeile überschreiben.',
  'Ergänzen: eine neue Zeile ohne ID einfügen (Ebene, Fahrzeug/Wagen und Name ausfüllen). Die Reihenfolge der Zeilen bestimmt die Reihenfolge im Aufbau.',
  'Löschen: die Zeile entfernen. Wird eine Fahrzeug- oder Wagenzeile gelöscht, entfällt die Einheit mit allem, was nur in der Datei darunter stand; vor dem Übernehmen zeigt die Seite, wie viel entfällt.',
  'Kistenpositionen stehen als eigene Zeilen unter ihrer Kiste. Gibt es zu einer Kiste keine Position mehr, ist sie leer.',
];

/** Erzeugt die Arbeitsmappe: Blatt „Aufbau“ mit den Tabellenzeilen, Blatt „Hinweise“ mit der Anleitung. */
export async function aufbauExcelErzeugen(
  zeilen: readonly AufbauTabellenZeile[],
): Promise<ArrayBuffer> {
  const XLSX = await import('@e965/xlsx');
  const daten = zeilen.map((z) => [
    z.ebene,
    z.fahrzeug,
    z.wagen,
    z.kiste,
    z.name,
    z.menge === '' ? '' : Number(z.menge),
    z.masseinheit,
    z.lager,
    z.platz,
    z.phase,
    z.bemerkung,
    z.standard,
    z.id,
  ]);
  const blatt = XLSX.utils.aoa_to_sheet([[...TABELLEN_KOPF], ...daten]);
  blatt['!cols'] = [14, 20, 20, 22, 36, 8, 12, 18, 16, 12, 30, 14, 38].map((wch) => ({ wch }));
  const hinweise = XLSX.utils.aoa_to_sheet(HINWEISE.map((zeile) => [zeile]));
  hinweise['!cols'] = [{ wch: 140 }];
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, blatt, BLATT_AUFBAU);
  XLSX.utils.book_append_sheet(mappe, hinweise, BLATT_HINWEISE);
  return XLSX.write(mappe, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const text = (wert: unknown): string =>
  typeof wert === 'string' ? wert : wert == null ? '' : String(wert);

/**
 * Liest das Blatt „Aufbau“ (sonst das erste Blatt). Spalten werden über ihre Überschrift gefunden,
 * Reihenfolge und zusätzliche Spalten sind egal; nur „Ebene“ ist Pflicht.
 */
export async function aufbauExcelLesen(datei: File): Promise<AufbauTabellenZeile[]> {
  const XLSX = await import('@e965/xlsx');
  const mappe = XLSX.read(await datei.arrayBuffer(), { type: 'array' });
  const name = mappe.SheetNames.includes(BLATT_AUFBAU) ? BLATT_AUFBAU : mappe.SheetNames[0];
  const blatt = name ? mappe.Sheets[name] : undefined;
  if (!blatt) throw new Error('Die Datei enthält kein Tabellenblatt.');
  const zeilen = XLSX.utils.sheet_to_json<unknown[]>(blatt, { header: 1, raw: true, defval: '' });
  const kopfIndex = zeilen.findIndex((z) =>
    z.some((c) => text(c).trim().toLowerCase() === 'ebene'),
  );
  if (kopfIndex < 0) {
    throw new Error('Keine Kopfzeile mit der Spalte „Ebene“ gefunden. Ist das eine Aufbau-Datei?');
  }
  const kopf = zeilen[kopfIndex]!.map((c) => text(c).trim().toLowerCase());
  const spalte = (titel: string): number => kopf.indexOf(titel.toLowerCase());
  const index = Object.fromEntries(TABELLEN_KOPF.map((titel) => [titel, spalte(titel)])) as Record<
    (typeof TABELLEN_KOPF)[number],
    number
  >;
  const zelle = (z: unknown[], titel: (typeof TABELLEN_KOPF)[number]): string =>
    index[titel] < 0 ? '' : text(z[index[titel]]);
  return zeilen.slice(kopfIndex + 1).map((z, i) => ({
    zeile: kopfIndex + i + 2,
    ebene: zelle(z, 'Ebene'),
    fahrzeug: zelle(z, 'Fahrzeug'),
    wagen: zelle(z, 'Wagen'),
    kiste: zelle(z, 'Kiste'),
    name: zelle(z, 'Name'),
    menge: zelle(z, 'Menge'),
    masseinheit: zelle(z, 'Maßeinheit'),
    lager: zelle(z, 'Lager'),
    platz: zelle(z, 'Platz'),
    phase: zelle(z, 'Phase'),
    bemerkung: zelle(z, 'Bemerkung'),
    standard: zelle(z, 'Standard-Kiste'),
    id: zelle(z, 'ID'),
  }));
}
