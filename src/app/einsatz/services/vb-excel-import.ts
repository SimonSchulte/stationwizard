import { FACHGRUPPEN, FACHGRUPPE_BEZEICHNUNG, Fachgruppe } from '../../kern/fachgruppen/fachgruppe';
import { VbAbschnitt, VbInhalt, VbLaufzettel } from '../models/vb.model';
import { laufzettelPlatz } from './laufzettel-platz';
import {
  IdErzeuger,
  LAUFZETTEL_VORGABE_UEBERSCHRIFT,
  naechsteAbschnittFarbe,
  neuePosition,
  neuerAbschnitt,
  neuerLaufzettel,
} from './vb-kopie';

/**
 * Liest eine Packliste aus Excel (eine Zeile je Material) in den Inhalt einer VB-Vorlage.
 * Gruppierung nach der Betreiberentscheidung (Konzept Abschnitt 2): Abschnitt = „Transport
 * mit“, Laufzettel = Lagerort innerhalb des Abschnitts. Die Funktionen sind rein; nur
 * `leseVbExcelDatei()` lädt die Excel-Bibliothek dynamisch.
 */

/** Überschrift des Laufzettels für Zeilen ohne Lagerort (die beladenen Wagen selbst). */
export const UEBERSCHRIFT_OHNE_LAGERORT = 'Zum Schluss: beladene Wagen verladen';
/** Titel des Abschnitts für Zeilen ohne „Transport mit“. */
export const TITEL_OHNE_TRANSPORT = 'Ohne Transportangabe';

export type VbExcelFeld = 'anzahl' | 'material' | 'lagerort' | 'transport' | 'ansprechpartner';

export interface VbExcelErgebnis {
  inhalt: VbInhalt;
  /** Hinweise zur Durchsicht vor dem Speichern; leer, wenn nichts auffiel. */
  auffaelligkeiten: string[];
  /** Gelesene Materialzeilen. */
  zeilen: number;
  /** Um wie viele Spalten die Daten gegenüber den Spaltenköpfen verschoben standen. */
  verschiebung: number;
}

const FELDNAMEN: Record<VbExcelFeld, readonly string[]> = {
  anzahl: ['anzahl', 'menge', 'stueck', 'stk'],
  material: ['material', 'artikel'],
  lagerort: ['lagerort', 'lager', 'von'],
  transport: ['transportmit', 'transport', 'aufin', 'auf'],
  ansprechpartner: ['ansprechpartner', 'ansprechperson', 'ansprechpartnerin', 'zustaendig'],
};

/** Bekannte Spalten ohne Bedeutung für die VB: Laufnummer und Erledigt-Haken. */
const IGNORIERT = ['ldfnr', 'lfdnr', 'lfnr', 'nr', 'erl', 'erledigt'];

const FELDER: readonly VbExcelFeld[] = [
  'anzahl',
  'material',
  'lagerort',
  'transport',
  'ansprechpartner',
];

/** Vergleichsform eines Spaltenkopfs: klein, ohne Leerraum, Umbrüche, Satzzeichen, Umlaute. */
function kopfSchluessel(wert: unknown): string {
  return zellText(wert)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\s .:;_/\-()]+/g, '');
}

function erkenneFeld(wert: unknown): VbExcelFeld | null {
  const schluessel = kopfSchluessel(wert);
  if (schluessel === '') return null;
  return FELDER.find((feld) => FELDNAMEN[feld].includes(schluessel)) ?? null;
}

/** Rohtext einer Zelle: Zahlen ohne Nachkomma-Rauschen, sonst getrimmter Text. */
function zellText(wert: unknown): string {
  if (wert === null || wert === undefined) return '';
  if (typeof wert === 'number') return Number.isFinite(wert) ? String(wert) : '';
  if (typeof wert === 'string') return wert.replace(/ /g, ' ').trim();
  if (typeof wert === 'boolean') return '';
  return '';
}

/** Mehrzeilige Zelle auf eine Zeile: Umbrüche werden zum Trenner. */
function einzeilig(text: string, trenner: string): string {
  return text
    .split(/\s*[\r\n]+\s*/)
    .map((teil) => teil.replace(/\s+/g, ' ').trim())
    .filter((teil) => teil !== '')
    .join(trenner);
}

function istPlatzhalter(text: string): boolean {
  return /\?{2,}/.test(text);
}

function istMenge(text: string): boolean {
  return text !== '' && text.length <= 20 && /^\d/.test(text);
}

interface Kopf {
  zeile: number;
  /** Spaltenindex je erkanntes Feld laut Kopfzeile. */
  spalten: Map<VbExcelFeld, number>;
  /** Nicht erkannte, nicht leere Spaltenköpfe. */
  unbekannt: string[];
}

function findeKopf(zeilen: readonly unknown[][]): Kopf | null {
  const grenze = Math.min(zeilen.length, 40);
  for (let i = 0; i < grenze; i += 1) {
    const spalten = new Map<VbExcelFeld, number>();
    const unbekannt: string[] = [];
    (zeilen[i] ?? []).forEach((zelle, index) => {
      const feld = erkenneFeld(zelle);
      if (feld) {
        if (!spalten.has(feld)) spalten.set(feld, index);
        return;
      }
      const text = zellText(zelle);
      if (text !== '' && !IGNORIERT.includes(kopfSchluessel(zelle))) {
        unbekannt.push(einzeilig(text, ' '));
      }
    });
    if (spalten.has('material') && spalten.size >= 3) return { zeile: i, spalten, unbekannt };
  }
  return null;
}

const VERSCHIEBUNGEN = [0, 1] as const;

/** Die erste Verschiebung der Reihenfolge, die mindestens `anteil` der besten erreicht. */
function waehleVerschiebung(
  reihenfolge: readonly number[],
  wert: (verschiebung: number) => number,
  anteil: number,
): number {
  const werte = reihenfolge.map((v) => wert(v));
  const bester = Math.max(...werte);
  if (bester <= 0) return reihenfolge[0];
  return reihenfolge[werte.findIndex((w) => w >= bester * anteil)];
}

/**
 * Wie weit die Daten gegenüber den Spaltenköpfen verschoben stehen (0 oder +1). Die reale
 * Packliste hat die Kopfzeile um eine Spalte versetzt: die Daten stehen unter einer leeren
 * Kopfzelle (nach links versetzte Daten lassen sich am Inhalt nicht von einer richtigen
 * Tabelle unterscheiden und werden nicht gesucht). Entscheidend ist der Inhalt. Die Textspalten verschieben sich gemeinsam; Maßstab
 * ist die Materialspalte, die in jeder Datenzeile gefüllt sein muss. Die Mengenspalte
 * bevorzugt dieselbe Verschiebung, weicht aber ab, wenn sie dort keine Mengen findet (die
 * Laufnummer daneben soll sie nicht verdrängen). Im Zweifel bleibt die Kopfzeile maßgeblich.
 */
function bestimmeVerschiebung(
  daten: readonly unknown[][],
  spalten: Map<VbExcelFeld, number>,
): Record<VbExcelFeld, number> {
  const fuellung = (index: number, menge: boolean): number => {
    if (index < 0) return 0;
    return daten.filter((zeile) => {
      const text = zellText(zeile[index]);
      return menge ? istMenge(text) : text !== '';
    }).length;
  };
  const materialIndex = spalten.get('material') ?? 0;
  const text = waehleVerschiebung(VERSCHIEBUNGEN, (v) => fuellung(materialIndex + v, false), 0.6);
  const anzahlIndex = spalten.get('anzahl');
  const anzahl =
    anzahlIndex === undefined
      ? 0
      : waehleVerschiebung(
          [text, ...VERSCHIEBUNGEN.filter((v) => v !== text)],
          (v) => fuellung(anzahlIndex + v, true),
          0.5,
        );
  return {
    anzahl,
    material: text,
    lagerort: text,
    transport: text,
    ansprechpartner: text,
  };
}

interface Zeile {
  nr: number;
  anzahl: string;
  material: string;
  lagerort: string;
  transport: string;
  partner: string[];
}

function fachgruppeAus(partner: readonly string[]): Fachgruppe | null {
  if (partner.length === 0) return null;
  const gefunden = new Set<Fachgruppe>();
  for (const eintrag of partner) {
    const schluessel = eintrag.toLowerCase().replace(/\s+/g, ' ').trim();
    const treffer = FACHGRUPPEN.find(
      (gruppe) => schluessel === `gf ${FACHGRUPPE_BEZEICHNUNG[gruppe].toLowerCase()}`,
    );
    if (!treffer) return null;
    gefunden.add(treffer);
  }
  return gefunden.size === 1 ? [...gefunden][0] : null;
}

function eindeutig(werte: readonly string[]): string[] {
  const gesehen = new Set<string>();
  const ergebnis: string[] = [];
  for (const wert of werte) {
    const schluessel = wert.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.push(wert);
  }
  return ergebnis;
}

function zeilenListe(nummern: readonly number[]): string {
  const sichtbar = nummern.slice(0, 8).join(', ');
  return nummern.length > 8 ? `${sichtbar} …` : sichtbar;
}

/** Titelvorschlag aus dem Dateinamen: ohne Endung, Unterstriche und Bindestriche als Leerzeichen. */
export function titelAusDateiname(dateiname: string): string {
  return dateiname
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wandelt die Zeilen des ersten Blatts (Zellen roh, wie `sheet_to_json({ header: 1 })` sie
 * liefert) in den Inhalt einer VB-Vorlage. Wirft einen `Error` mit verständlichem Text, wenn
 * keine Kopfzeile mit Material gefunden wird oder keine Materialzeile vorhanden ist.
 */
export function leseVbExcelZeilen(
  tabelle: readonly unknown[][],
  neueId?: IdErzeuger,
): VbExcelErgebnis {
  const kopf = findeKopf(tabelle);
  if (!kopf) {
    throw new Error(
      'In der Datei wurde keine Kopfzeile gefunden. Erwartet werden Spalten wie ' +
        '„Anzahl“, „Material“, „Lagerort“, „Transport mit“ und „Ansprechpartner“.',
    );
  }
  const auffaelligkeiten: string[] = [];
  const daten = tabelle.slice(kopf.zeile + 1);
  const verschiebungen = bestimmeVerschiebung(daten, kopf.spalten);
  const verschiebung = verschiebungen.material;
  if (verschiebung !== 0 || verschiebungen.anzahl !== 0) {
    auffaelligkeiten.push(
      'Die Spaltenköpfe stehen gegenüber den Daten um eine Spalte ' +
        'versetzt; die Daten wurden anhand ihres Inhalts den Köpfen zugeordnet. Bitte die ' +
        'Zuordnung in der Vorschau prüfen.',
    );
  }
  if (kopf.unbekannt.length > 0) {
    auffaelligkeiten.push(`Unbekannte Spalten wurden ignoriert: ${kopf.unbekannt.join(', ')}.`);
  }
  for (const feld of FELDER) {
    if (!kopf.spalten.has(feld) && feld !== 'material') {
      auffaelligkeiten.push(`Es gibt keine Spalte „${feldTitel(feld)}“; das Feld bleibt leer.`);
    }
  }

  const zelle = (zeile: readonly unknown[], feld: VbExcelFeld): string => {
    const index = kopf.spalten.get(feld);
    return index === undefined ? '' : zellText(zeile[index + verschiebungen[feld]]);
  };

  const zeilen: Zeile[] = [];
  const ohneMaterial: number[] = [];
  const platzhalter: number[] = [];
  daten.forEach((roh, index) => {
    const nr = kopf.zeile + 2 + index;
    const zeile = roh ?? [];
    const material = einzeilig(zelle(zeile, 'material'), ' ');
    const anzahl = einzeilig(zelle(zeile, 'anzahl'), ' ');
    const lagerort = einzeilig(zelle(zeile, 'lagerort'), ' / ');
    const transport = einzeilig(zelle(zeile, 'transport'), ' / ');
    const ansprechpartner = einzeilig(zelle(zeile, 'ansprechpartner'), ' / ');
    if (material === '' && anzahl === '' && lagerort === '' && transport === '') {
      if (ansprechpartner === '') return; // leere Zeile
    }
    if (material === '') {
      ohneMaterial.push(nr);
      return;
    }
    if ([material, anzahl, lagerort, transport, ansprechpartner].some(istPlatzhalter)) {
      platzhalter.push(nr);
    }
    zeilen.push({
      nr,
      anzahl,
      material,
      lagerort,
      transport,
      partner: ansprechpartner === '' ? [] : ansprechpartner.split(' / '),
    });
  });
  if (zeilen.length === 0) {
    throw new Error('Die Datei enthält keine Zeile mit einer Materialangabe.');
  }
  if (ohneMaterial.length > 0) {
    auffaelligkeiten.push(
      `${ohneMaterial.length} Zeile(n) ohne Material wurden übersprungen (Zeile ` +
        `${zeilenListe(ohneMaterial)}).`,
    );
  }
  if (platzhalter.length > 0) {
    auffaelligkeiten.push(
      `${platzhalter.length} Zeile(n) enthalten Platzhalter wie „???“ (Zeile ` +
        `${zeilenListe(platzhalter)}).`,
    );
  }
  const ohneLagerort = zeilen.filter((z) => z.lagerort === '').map((z) => z.nr);
  if (ohneLagerort.length > 0) {
    auffaelligkeiten.push(
      `${ohneLagerort.length} Zeile(n) ohne Lagerort stehen auf Laufzetteln „` +
        `${UEBERSCHRIFT_OHNE_LAGERORT}“ (Zeile ${zeilenListe(ohneLagerort)}).`,
    );
  }
  const ohneTransport = zeilen.filter((z) => z.transport === '').map((z) => z.nr);
  if (ohneTransport.length > 0) {
    auffaelligkeiten.push(
      `${ohneTransport.length} Zeile(n) ohne „Transport mit“ stehen im Abschnitt „` +
        `${TITEL_OHNE_TRANSPORT}“ (Zeile ${zeilenListe(ohneTransport)}).`,
    );
  }

  const inhalt: VbInhalt = { anweisungen: '', abschnitte: [] };
  const abschnitte = new Map<string, { abschnitt: VbAbschnitt; zeilen: Zeile[] }>();
  for (const zeile of zeilen) {
    const schluessel = zeile.transport.toLowerCase();
    let eintrag = abschnitte.get(schluessel);
    if (!eintrag) {
      const abschnitt = neuerAbschnitt(naechsteAbschnittFarbe(inhalt), neueId);
      abschnitt.titel = zeile.transport === '' ? TITEL_OHNE_TRANSPORT : zeile.transport;
      inhalt.abschnitte.push(abschnitt);
      eintrag = { abschnitt, zeilen: [] };
      abschnitte.set(schluessel, eintrag);
    }
    eintrag.zeilen.push(zeile);
  }

  for (const { abschnitt, zeilen: abschnittZeilen } of abschnitte.values()) {
    const jeLagerort = new Map<string, Zeile[]>();
    for (const zeile of abschnittZeilen) {
      const schluessel = zeile.lagerort.toLowerCase();
      jeLagerort.set(schluessel, [...(jeLagerort.get(schluessel) ?? []), zeile]);
    }
    // Zeilen ohne Lagerort („beladene Wagen“) kommen zuletzt.
    const ohne = jeLagerort.get('');
    jeLagerort.delete('');
    const gruppen = [...jeLagerort.values(), ...(ohne ? [ohne] : [])];
    for (const gruppe of gruppen) {
      const laufzettel: VbLaufzettel = neuerLaufzettel(undefined, neueId);
      laufzettel.lagerort = gruppe[0].lagerort;
      laufzettel.transportMit = abschnitt.titel === TITEL_OHNE_TRANSPORT ? '' : abschnitt.titel;
      laufzettel.ueberschrift =
        gruppe[0].lagerort === '' ? UEBERSCHRIFT_OHNE_LAGERORT : LAUFZETTEL_VORGABE_UEBERSCHRIFT;
      const partner = eindeutig(gruppe.flatMap((z) => z.partner));
      laufzettel.auftraggeber = partner.join(' / ');
      laufzettel.fachgruppe = fachgruppeAus(partner);
      laufzettel.positionen = gruppe.map((z) => {
        const position = neuePosition(neueId);
        position.anzahl = z.anzahl;
        position.material = z.material;
        return position;
      });
      abschnitt.laufzettel.push(laufzettel);
      const platz = laufzettelPlatz(laufzettel);
      if (platz.zustand === 'zu-voll') {
        auffaelligkeiten.push(
          `Der Laufzettel „${laufzettel.lagerort || UEBERSCHRIFT_OHNE_LAGERORT}“ im Abschnitt „` +
            `${abschnitt.titel}“ ist zu voll (${platz.belegt}/${platz.kapazitaet} Zeilen) und ` +
            'sollte im Editor geteilt werden.',
        );
      }
    }
  }

  return { inhalt, auffaelligkeiten, zeilen: zeilen.length, verschiebung };
}

function feldTitel(feld: VbExcelFeld): string {
  switch (feld) {
    case 'anzahl':
      return 'Anzahl';
    case 'material':
      return 'Material';
    case 'lagerort':
      return 'Lagerort';
    case 'transport':
      return 'Transport mit';
    case 'ansprechpartner':
      return 'Ansprechpartner';
  }
}

/**
 * Liest das erste Blatt einer Excel-Datei. `@e965/xlsx` wird erst hier dynamisch geladen.
 * Wirft bei unlesbarer Datei oder fehlender Kopfzeile einen `Error` mit verständlichem Text.
 */
export async function leseVbExcelDatei(
  daten: ArrayBuffer,
  neueId?: IdErzeuger,
): Promise<VbExcelErgebnis> {
  const XLSX = await import('@e965/xlsx');
  let tabelle: unknown[][];
  try {
    const mappe = XLSX.read(new Uint8Array(daten), { type: 'array' });
    const blatt = mappe.Sheets[mappe.SheetNames[0]];
    if (!blatt) throw new Error('leer');
    tabelle = XLSX.utils.sheet_to_json<unknown[]>(blatt, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: true,
    });
  } catch {
    throw new Error('Die Datei konnte nicht als Excel-Arbeitsmappe gelesen werden.');
  }
  return leseVbExcelZeilen(tabelle, neueId);
}
