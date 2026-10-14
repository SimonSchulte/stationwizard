import type { EhrungPerson, EhrungSchluessel, UhrArt } from './ehrungen-regeln';

/**
 * Füllt das PDF-Formular „Antrag auf Verleihung einer Auszeichnung“ (Johanniter, Revision 3.2) im
 * Browser. Die Formularfelder bleiben Formularfelder – nichts wird abgeflacht –, sodass alles
 * Fehlende (Datum der Verleihung, Unterschriften, nicht erfasste Angaben) danach von Hand ergänzt
 * werden kann. Straße, Wohnort und Geburtsdatum kommen nur für diesen Antrag einzeln aus HiOrg
 * (`GET /api/hiorg/personal/<Id>/antragsdaten`) und werden nie gespeichert.
 *
 * Die Feldnamen stammen aus der Vorlage selbst und sind teils irreführend: das Feld für
 * „Name, Vorname“ heißt `über den Landesverband einzureichen`, die Begründung `Text1`, die
 * „verliehen am“-Felder der Ehrenzeichen `1`–`4`. Ändert sich die Vorlage, meldet
 * `fehlendeFelder()` das vor dem Hochladen und `ehrungsantragFuellen()` bricht ab, statt ein halb
 * gefülltes Formular zu liefern.
 */

export const EHRUNGSANTRAG_MEDIENTYP = 'application/pdf';

const FELD_NAME = 'über den Landesverband einzureichen';
const FELD_LV = 'LV';
const FELD_RV = 'RVKV';
const FELD_STRASSE = 'Straße';
const FELD_WOHNORT = 'Wohnort';
const FELD_GEBURTSDATUM = 'Geburtsdatum';
const FELD_MITGLIED_SEIT = 'Mitglied seit';
const FELD_TAETIGKEIT = 'Tätigkeit';
const FELD_DIENSTSTUNDEN = 'Dienststunden';
const FELD_BEGRUENDUNG = 'Text1';
const FELD_FRAU = 'Frau';
const FELD_HERR = 'Herr';

/** Kästchen der beantragten Auszeichnung. Leistungsabzeichen: die allgemeine Zeile, nicht Jugend oder Ausland. */
export const ANTRAG_KAESTCHEN: Readonly<Record<EhrungSchluessel, string>> = {
  bronze: 'Leistungsabzeichen',
  silber: 'Leistungsabzeichen_2',
  gold: 'Leistungsabzeichen_3',
  'jubilaeum-25': 'Jubiläumsabzeichen',
  'jubilaeum-40': 'Jubiläumsabzeichen_2',
  'jubilaeum-50': 'Jubiläumsabzeichen_3',
  'jubilaeum-60': 'Jubiläumsabzeichen_4',
  'uhr-30': 'Jubiläumsuhr',
  'uhr-40': 'Jubiläumsuhr_2',
  'uhr-50': 'Jubiläumsuhr_3',
  ehrenzeichen: 'Ehrenzeichen',
  'ehrenzeichen-bande': 'Ehrenzeichen am Bande',
  ehrennadel: 'Ehrennadel mit Band des',
};

/** Feld „verliehen am“ je bereits erhaltener Auszeichnung (nach Lage im Formular zugeordnet). */
export const VERLIEHEN_AM_FELD: Readonly<Record<EhrungSchluessel, string>> = {
  bronze: 'Bronze_2',
  silber: 'Silber_2',
  gold: 'Gold_2',
  'jubilaeum-25': '25 Jahre',
  'jubilaeum-40': '40 Jahre_2',
  'jubilaeum-50': '50 Jahre_2',
  'jubilaeum-60': '60 Jahre',
  'uhr-30': '30 Jahre',
  'uhr-40': '40 Jahre',
  'uhr-50': '50 Jahre',
  ehrenzeichen: '2',
  'ehrenzeichen-bande': '3',
  ehrennadel: '4',
};

const TEXTFELDER = [
  FELD_NAME,
  FELD_LV,
  FELD_RV,
  FELD_STRASSE,
  FELD_WOHNORT,
  FELD_GEBURTSDATUM,
  FELD_MITGLIED_SEIT,
  FELD_TAETIGKEIT,
  FELD_DIENSTSTUNDEN,
  FELD_BEGRUENDUNG,
  ...Object.values(VERLIEHEN_AM_FELD),
];
const KAESTCHEN = [FELD_FRAU, FELD_HERR, ...Object.values(ANTRAG_KAESTCHEN)];

export interface EhrungsantragDaten {
  person: Pick<EhrungPerson, 'nachname' | 'vorname' | 'stunden' | 'eintrittsdatum' | 'erhalten'>;
  auszeichnung: EhrungSchluessel;
  landesverband: string;
  regionalverband: string;
  taetigkeit: string;
  begruendung: string;
  /** Aus der HiOrg-Anrede; `null` lässt Frau/Herr offen. */
  anrede: UhrArt | null;
  /** Aus HiOrg für genau diesen Antrag; fehlt sie, bleiben die Felder leer. */
  anschrift?: {
    strasse: string | null;
    plz: string | null;
    ort: string | null;
    /** `JJJJ-MM-TT`. */
    geburtsdatum: string | null;
  } | null;
}

/** `JJJJ-MM-TT` → `TT.MM.JJJJ`; ohne Zeitzonenumrechnung, damit sich der Tag nicht verschiebt. */
function deutschesDatum(iso: string | null): string {
  const treffer = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : '';
}

/** Einträge für „verliehen am“: das Vergabejahr, ohne bekanntes Jahr ein schlichtes „erhalten“. */
export function verliehenAm(
  erhalten: EhrungsantragDaten['person']['erhalten'],
): [feld: string, wert: string][] {
  return (Object.keys(VERLIEHEN_AM_FELD) as EhrungSchluessel[])
    .filter((schluessel) => schluessel in erhalten)
    .map((schluessel) => {
      const jahr = erhalten[schluessel];
      return [VERLIEHEN_AM_FELD[schluessel], jahr ? String(jahr) : 'erhalten'];
    });
}

async function ladePdf(vorlage: ArrayBuffer) {
  const { PDFDocument } = await import('pdf-lib');
  return PDFDocument.load(vorlage);
}

/** Feldnamen, die der Vorlage fehlen; leer heißt: die Vorlage passt. */
export async function fehlendeFelder(vorlage: ArrayBuffer): Promise<string[]> {
  const { PDFCheckBox, PDFTextField } = await import('pdf-lib');
  let dokument;
  try {
    dokument = await ladePdf(vorlage);
  } catch {
    throw new Error('Die Datei ist kein lesbares PDF.');
  }
  const felder = new Map(
    dokument
      .getForm()
      .getFields()
      .map((feld) => [feld.getName(), feld]),
  );
  return [
    ...TEXTFELDER.filter((name) => !(felder.get(name) instanceof PDFTextField)),
    ...KAESTCHEN.filter((name) => !(felder.get(name) instanceof PDFCheckBox)),
  ];
}

export async function ehrungsantragFuellen(
  vorlage: ArrayBuffer,
  daten: EhrungsantragDaten,
): Promise<Uint8Array> {
  const fehlend = await fehlendeFelder(vorlage);
  if (fehlend.length > 0) {
    throw new Error(
      `Die hinterlegte Antragsvorlage passt nicht zum erwarteten Formular (es fehlt unter anderem „${fehlend[0]}“). Bitte im Verwaltungsbereich die passende Vorlage hinterlegen.`,
    );
  }
  const dokument = await ladePdf(vorlage);
  const formular = dokument.getForm();
  const text = (name: string, wert: string) => formular.getTextField(name).setText(wert);

  text(FELD_NAME, `${daten.person.nachname}, ${daten.person.vorname}`);
  text(FELD_LV, daten.landesverband);
  text(FELD_RV, daten.regionalverband);
  text(FELD_STRASSE, daten.anschrift?.strasse ?? '');
  text(FELD_WOHNORT, [daten.anschrift?.plz, daten.anschrift?.ort].filter(Boolean).join(' '));
  text(FELD_GEBURTSDATUM, deutschesDatum(daten.anschrift?.geburtsdatum ?? null));
  text(FELD_MITGLIED_SEIT, deutschesDatum(daten.person.eintrittsdatum));
  text(FELD_TAETIGKEIT, daten.taetigkeit.trim());
  text(FELD_DIENSTSTUNDEN, daten.person.stunden.toLocaleString('de-DE'));
  text(FELD_BEGRUENDUNG, daten.begruendung.trim());
  for (const [feld, wert] of verliehenAm(daten.person.erhalten)) text(feld, wert);

  if (daten.anrede === 'Damen') formular.getCheckBox(FELD_FRAU).check();
  if (daten.anrede === 'Herren') formular.getCheckBox(FELD_HERR).check();
  formular.getCheckBox(ANTRAG_KAESTCHEN[daten.auszeichnung]).check();

  // Nicht abflachen: die übrigen Felder bleiben ausfüllbar.
  return dokument.save();
}
