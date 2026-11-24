import { istObjekt, istText } from './json-lesen';

/**
 * Inhalt der Schadens- und Verlustmeldung (Anlage 5). Die Grenzen folgen den Feldgrößen des
 * Formulars (Arial 11 pt, siehe `docs/konzept-vorgaenge.md`, Abschnitt 9); Frontend und Worker
 * prüfen dieselben Werte (`src/app/vorgaenge/models/schadensmeldung.model.ts`), gemeinsam ändern.
 */
export const MELDUNG_GRENZEN = {
  einheit: 40,
  bezeichnung: 40,
  kennzeichen: 20,
  ort: 90,
  sachverhalt: 4000,
  stellungnahme: 350,
  empfehlung: 350,
} as const;

export type MeldungTextFeld = keyof typeof MELDUNG_GRENZEN;

export interface SchadensmeldungInhalt {
  art: 'schaden' | 'verlust';
  /** Kalendertag `JJJJ-MM-TT` oder leer, solange er fehlt. */
  datumFeststellung: string;
  einheit: string;
  bezeichnung: string;
  kennzeichen: string;
  ort: string;
  sachverhalt: string;
  stellungnahme: string;
  empfehlung: string;
}

const FELDER = [
  'art',
  'datumFeststellung',
  'einheit',
  'bezeichnung',
  'kennzeichen',
  'ort',
  'sachverhalt',
  'stellungnahme',
  'empfehlung',
] as const;

const MEHRZEILIG: ReadonlySet<MeldungTextFeld> = new Set([
  'sachverhalt',
  'stellungnahme',
  'empfehlung',
]);

function istKalendertag(wert: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const datum = new Date(`${wert}T00:00:00Z`);
  return !Number.isNaN(datum.getTime()) && datum.toISOString().startsWith(wert);
}

/** Steuerzeichen sind verboten; in mehrzeiligen Feldern bleiben Zeilenumbrüche und Tabulator erlaubt. */
function enthaeltSteuerzeichen(wert: string, mehrzeilig: boolean): boolean {
  for (const zeichen of wert) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (mehrzeilig && (code === 0x0a || code === 0x09)) continue;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Gibt den geprüften Inhalt zurück oder `null`; unbekannte oder fehlende Felder werden abgelehnt. */
export function pruefeSchadensmeldung(wert: unknown): SchadensmeldungInhalt | null {
  if (!istObjekt(wert)) return null;
  const schluessel = Object.keys(wert).sort().join(',');
  if (schluessel !== [...FELDER].sort().join(',')) return null;

  const art = wert['art'];
  if (art !== 'schaden' && art !== 'verlust') return null;
  const datum = wert['datumFeststellung'];
  if (!istText(datum) || (datum !== '' && !istKalendertag(datum))) return null;

  const texte = {} as Record<MeldungTextFeld, string>;
  for (const feld of Object.keys(MELDUNG_GRENZEN) as MeldungTextFeld[]) {
    const roh = wert[feld];
    if (!istText(roh)) return null;
    // Einzeilige Felder werden getrimmt; mehrzeilige behalten ihre Zeilen, verlieren aber Ränder.
    const text = roh.trim();
    if (text.length > MELDUNG_GRENZEN[feld]) return null;
    if (enthaeltSteuerzeichen(text, MEHRZEILIG.has(feld))) return null;
    texte[feld] = text;
  }
  return { art, datumFeststellung: datum, ...texte };
}

/** Pflichtangaben, die noch fehlen; leer heißt vollständig. */
export function fehlendePflichtangaben(inhalt: SchadensmeldungInhalt): string[] {
  const fehlend: string[] = [];
  if (!inhalt.datumFeststellung) fehlend.push('Datum der Feststellung');
  if (!inhalt.einheit) fehlend.push('Einheit');
  if (!inhalt.bezeichnung) fehlend.push('Bezeichnung');
  if (!inhalt.kennzeichen) fehlend.push('Kennzeichen');
  if (!inhalt.sachverhalt) fehlend.push('Sachverhalt');
  return fehlend;
}
