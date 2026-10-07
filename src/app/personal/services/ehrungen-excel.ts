import {
  EHRUNG_BEZEICHNUNG,
  ansprueche,
  hatErhalten,
  mitgliedsjahre,
  zuEhrende,
  type EhrungPerson,
  type EhrungSchluessel,
} from './ehrungen-regeln';

export const EHRUNGEN_EXCEL_MEDIENTYP =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const JA = 'ja';

/**
 * Excel-Fassung der Ehrungen: dieselben Spalten wie die Arbeitstabelle „Ehrungen
 * 2026", Name in Nach- und Vorname getrennt, dazu die einzelnen Auszeichnungen
 * als Spalten mit dem Vergabejahr (oder „ja“, wenn das Jahr unbekannt ist). Die „Erfüllt"-Spalten sind zum Zeitpunkt des Exports berechnete
 * Werte, keine Formeln – die Datei bleibt ein Stand und rechnet nicht mit.
 */
export async function ehrungenExcelErzeugen(
  personen: readonly EhrungPerson[],
  jahr: number,
): Promise<ArrayBuffer> {
  const XLSX = await import('@e965/xlsx');
  /** Vergabejahr, bei unbekanntem Jahr „ja“, sonst leer. */
  const hat = (person: EhrungPerson, schluessel: EhrungSchluessel) =>
    hatErhalten(person.erhalten, schluessel) ? (person.erhalten[schluessel] ?? JA) : '';
  const bezeichnung = (schluessel: EhrungSchluessel | null) =>
    schluessel ? EHRUNG_BEZEICHNUNG[schluessel] : '';

  const kopf = [
    'Nachname',
    'Vorname',
    'Gesamtstunden',
    'Mitglied seit',
    'Mitgliedsjahre',
    'Leistungsabzeichen Bronze',
    'Leistungsabzeichen Silber',
    'Leistungsabzeichen Gold',
    'Erfüllt Leistungsabzeichen',
    'Jubiläumszeichen 25 Jahre',
    'Jubiläumszeichen 40 Jahre',
    'Jubiläumszeichen 50 Jahre',
    'Jubiläumszeichen 60 Jahre',
    'Erfüllt Jubiläumszeichen',
    'Ehrenzeichen',
    'Ehrenzeichen am Bande',
    EHRUNG_BEZEICHNUNG.ehrennadel,
    'Besondere Verdienste',
    'Erfüllt Ehrenzeichen',
  ];
  const zeilen = personen.map((person) => {
    const a = ansprueche(person, jahr);
    return [
      person.nachname,
      person.vorname,
      person.stunden,
      person.eintrittsdatum ?? '',
      mitgliedsjahre(person.eintrittsdatum, jahr) ?? '',
      hat(person, 'bronze'),
      hat(person, 'silber'),
      hat(person, 'gold'),
      bezeichnung(a.leistung.erfuellt),
      hat(person, 'jubilaeum-25'),
      hat(person, 'jubilaeum-40'),
      hat(person, 'jubilaeum-50'),
      hat(person, 'jubilaeum-60'),
      bezeichnung(a.jubilaeum.erfuellt),
      hat(person, 'ehrenzeichen'),
      hat(person, 'ehrenzeichen-bande'),
      hat(person, 'ehrennadel'),
      person.besondereVerdienste ? JA : '',
      bezeichnung(a.ehrenzeichen.erfuellt),
    ];
  });

  const blatt = XLSX.utils.aoa_to_sheet([kopf, ...zeilen]);
  blatt['!cols'] = kopf.map((titel, index) => ({
    wch: index < 2 ? 20 : Math.max(14, titel.length),
  }));
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, blatt, `Ehrungen ${jahr}`);
  return XLSX.write(mappe, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/**
 * Liste „Zu Ehrende“: eine Zeile je noch offener Ehrung (siehe `zuEhrende()`), sortiert nach
 * Auszeichnung und Name, mit der Grundlage des Anspruchs und bereits Erhaltenem derselben Gruppe.
 */
export async function zuEhrendeExcelErzeugen(
  personen: readonly EhrungPerson[],
  jahr: number,
): Promise<ArrayBuffer> {
  const XLSX = await import('@e965/xlsx');
  const kopf = ['Auszeichnung', 'Gruppe', 'Nachname', 'Vorname', 'Grundlage', 'Bisher erhalten'];
  const zeilen = zuEhrende(personen, jahr).map((eintrag) => [
    EHRUNG_BEZEICHNUNG[eintrag.auszeichnung],
    eintrag.gruppe,
    eintrag.nachname,
    eintrag.vorname,
    eintrag.grundlage,
    eintrag.bisher,
  ]);
  const blatt = XLSX.utils.aoa_to_sheet([kopf, ...zeilen]);
  blatt['!cols'] = [38, 20, 20, 20, 44, 28].map((wch) => ({ wch }));
  const mappe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mappe, blatt, `Zu Ehrende ${jahr}`);
  return XLSX.write(mappe, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
