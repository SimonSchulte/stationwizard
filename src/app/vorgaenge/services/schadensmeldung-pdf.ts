import type { PDFDocument, PDFFont, PDFImage, PDFPage, PDFTextField } from 'pdf-lib';
import { PDF_FARBEN } from '../../kern/pdf/pdf-bibliothek';
import type { UnterschriftDaten } from '../../kern/unterschrift/unterschrift.model';
import {
  UNTERSCHRIFT_BREITE,
  UNTERSCHRIFT_HOEHE,
} from '../../kern/unterschrift/unterschrift.model';
import { MELDUNG_ART_LABEL, SchadensmeldungInhalt } from '../models/schadensmeldung.model';
import type { Slot } from '../models/vorgang.model';

/**
 * Füllt das PDF-Formular „Schadens- und Verlustmeldung“ (Anlage 5, Stand 23.11.2023) im Browser:
 * Angaben, Namen und Daten der Unterschriften und die Unterschriften selbst als Bild. Das Formular
 * hat Textfelder und zwei Kästchen, aber keine Signaturfelder; die Unterschrift wird deshalb über
 * der Linie rechts neben dem Datumsfeld gezeichnet, dessen Lage aus der Vorlage stammt.
 *
 * Die Feldnamen stammen aus der Vorlage selbst und sind teils sperrig (zwei Leerzeichen,
 * Suffixe `_2`/`_3`). Ändert sich die Vorlage, meldet `fehlendeFelder()` das vor dem Hochladen und
 * `schadensmeldungFuellen()` bricht ab, statt ein halb gefülltes Formular zu liefern.
 *
 * Passt ein Text nicht in sein Feld, wird die Schrift verkleinert; passt der Sachverhalt auch dann
 * nicht, steht im Feld „Siehe Beiblatt“ und der volle Text folgt auf einer zweiten Seite.
 */

export const SCHADENSMELDUNG_MEDIENTYP = 'application/pdf';

const FELD_DATUM = 'Datum der Feststellung';
const FELD_EINHEIT = 'Einheit';
const FELD_BEZEICHNUNG = 'Bezeichnung  Fahrzeug  Gerätesatz Kennzeichen Fahrzeug';
const FELD_KENNZEICHEN = 'Bezeichnung  Fahrzeug  Gerätesatz Kennzeichen Fahrzeug_2';
const FELD_ORT = 'Ort Datum Uhrzeit der Beschädigung des Verlustes falls bekannt';
const FELD_SACHVERHALT = 'Darstellung';
const FELD_STELLUNGNAHME = 'Stellungnahme eines Verantwortlichen';
const FELD_EMPFEHLUNG = 'Verfahrensweise';

/** Kästchen links „Schadensmeldung“, rechts „Verlustmeldung“ (aus der Lage im Formular). */
export const KAESTCHEN = { schaden: 'Check Box11', verlust: 'Check Box12' } as const;

/** Namens- und Datumsfelder der drei Zeilen von oben nach unten. */
export const UNTERSCHRIFT_FELDER: Readonly<Record<Slot, { name: string; datum: string }>> = {
  fest: { name: 'Name', datum: 'Datum' },
  leitung: { name: 'Name_2', datum: 'Datum_2' },
  verantw: { name: 'Name_3', datum: 'Datum_3' },
};

const TEXTFELDER = [
  FELD_DATUM,
  FELD_EINHEIT,
  FELD_BEZEICHNUNG,
  FELD_KENNZEICHEN,
  FELD_ORT,
  FELD_SACHVERHALT,
  FELD_STELLUNGNAHME,
  FELD_EMPFEHLUNG,
  ...Object.values(UNTERSCHRIFT_FELDER).flatMap((f) => [f.name, f.datum]),
];
const KAESTCHEN_NAMEN = Object.values(KAESTCHEN);

const SCHRIFTGROESSEN = [11, 10, 9, 8, 7];
/** Der Sachverhalt wird nicht kleiner als 9 pt gesetzt; was dann nicht passt, steht auf dem Beiblatt. */
const SACHVERHALT_MIN_PT = 9;
const ZEILENABSTAND = 1.2;
/** Abstand zwischen Datumsfeld und Unterschriftsbild sowie Höhe des Bildes über der Linie. */
const UNTERSCHRIFT_ABSTAND = 12;
const UNTERSCHRIFT_HOEHE_PT = 28;

export interface UnterschriftFuerPdf {
  slot: Slot;
  name: string;
  /** Kalendertag oder Zeitstempel; verwendet werden die ersten zehn Zeichen. */
  datum: string;
  signatur: UnterschriftDaten;
}

export interface SchadensmeldungPdfDaten {
  inhalt: SchadensmeldungInhalt;
  unterschriften: readonly UnterschriftFuerPdf[];
}

/** Liefert ein PNG der Schriftunterschrift; `null`, wenn keines erzeugt werden kann. */
export type SchriftBildErzeuger = (text: string, font: string) => Promise<Uint8Array | null>;

export interface FuellOptionen {
  /** Formularfelder in feste Seiteninhalte verwandeln (Standard). Für ein unterschriebenes Dokument gewollt. */
  flach?: boolean;
  schriftBild?: SchriftBildErzeuger;
}

async function ladePdf(vorlage: ArrayBuffer): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  return PDFDocument.load(vorlage);
}

/** Feldnamen, die der Vorlage fehlen; leer heißt: die Vorlage passt. */
export async function fehlendeFelder(vorlage: ArrayBuffer): Promise<string[]> {
  const { PDFCheckBox, PDFTextField } = await import('pdf-lib');
  let dokument: PDFDocument;
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
    ...KAESTCHEN_NAMEN.filter((name) => !(felder.get(name) instanceof PDFCheckBox)),
  ];
}

/** `JJJJ-MM-TT…` als `TT.MM.JJJJ`; leer bleibt leer. */
export function datumDeutsch(iso: string): string {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : '';
}

/** Ersetzt Zeichen, die die Standardschrift (WinAnsi) nicht darstellen kann, durch „?“. */
export function fuerStandardschrift(text: string, schrift: PDFFont): string {
  const erlaubt = new Set(schrift.getCharacterSet());
  return [...text]
    .map((zeichen) => {
      if (zeichen === '\n') return zeichen;
      return erlaubt.has(zeichen.codePointAt(0) ?? 0) ? zeichen : '?';
    })
    .join('');
}

/** Bricht Text an Wortgrenzen und Zeilenumbrüchen auf eine Breite um; zu lange Wörter werden getrennt. */
export function bricheUm(
  text: string,
  schrift: PDFFont,
  groesse: number,
  breite: number,
): string[] {
  const zeilen: string[] = [];
  for (const absatz of text.split('\n')) {
    let zeile = '';
    for (const wort of absatz.split(' ')) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (schrift.widthOfTextAtSize(probe, groesse) <= breite) {
        zeile = probe;
        continue;
      }
      if (zeile) zeilen.push(zeile);
      let rest = wort;
      while (schrift.widthOfTextAtSize(rest, groesse) > breite && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && schrift.widthOfTextAtSize(rest.slice(0, n), groesse) > breite) n--;
        zeilen.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      zeile = rest;
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

function feldRechteck(feld: PDFTextField): { x: number; y: number; width: number; height: number } {
  const widget = feld.acroField.getWidgets()[0];
  if (!widget) throw new Error('Das Formularfeld hat keine Position im Dokument.');
  return widget.getRectangle();
}

/**
 * Setzt einen Text in ein Feld und wählt die größte Schrift, in der er passt. `false`, wenn er auch
 * in der kleinsten nicht passt (der Aufrufer entscheidet dann über das Beiblatt).
 */
function setzeText(
  feld: PDFTextField,
  text: string,
  schrift: PDFFont,
  mehrzeilig: boolean,
  minGroesse = SCHRIFTGROESSEN[SCHRIFTGROESSEN.length - 1] ?? 7,
  erzwingen = true,
): boolean {
  const rect = feldRechteck(feld);
  const breite = rect.width - 6;
  for (const groesse of SCHRIFTGROESSEN.filter((g) => g >= minGroesse)) {
    const zeilen = mehrzeilig
      ? bricheUm(text, schrift, groesse, breite).length
      : schrift.widthOfTextAtSize(text, groesse) <= breite
        ? 1
        : Number.POSITIVE_INFINITY;
    if (zeilen * groesse * ZEILENABSTAND <= rect.height - 4) {
      feld.setText(text);
      feld.setFontSize(groesse);
      return true;
    }
  }
  // Passt auch in der kleinsten Schrift nicht: nie ein leeres Feld liefern, wenn der Aufrufer es erzwingt.
  if (erzwingen) {
    feld.setText(text);
    feld.setFontSize(minGroesse);
  }
  return false;
}

function hexZuRgb(hex: string, rgb: (r: number, g: number, b: number) => unknown) {
  const wert = Number.parseInt(hex.slice(1), 16);
  return rgb(((wert >> 16) & 255) / 255, ((wert >> 8) & 255) / 255, (wert & 255) / 255);
}

/** Standard: Schrift in einem Canvas des Browsers zeichnen (die Schriften sind im Build gebündelt). */
export async function schriftAlsPng(text: string, font: string): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  try {
    await document.fonts.load(`64px "${font}"`);
    const canvas = document.createElement('canvas');
    const kontext = canvas.getContext('2d');
    if (!kontext) return null;
    kontext.font = `64px "${font}", cursive`;
    const breite = Math.ceil(kontext.measureText(text).width) + 24;
    canvas.width = Math.max(32, breite);
    canvas.height = 112;
    kontext.font = `64px "${font}", cursive`;
    kontext.fillStyle = PDF_FARBEN.dunkelblau;
    kontext.textBaseline = 'middle';
    kontext.fillText(text, 12, 56);
    const blob = await new Promise<Blob | null>((fertig) => canvas.toBlob(fertig, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function zeichneUnterschrift(
  dokument: PDFDocument,
  seite: PDFPage,
  rect: { x: number; y: number; breite: number; hoehe: number },
  signatur: UnterschriftDaten,
  schriftBild: SchriftBildErzeuger,
  notschrift: PDFFont,
): Promise<void> {
  const { LineCapStyle, rgb } = await import('pdf-lib');
  const farbe = hexZuRgb(PDF_FARBEN.dunkelblau, rgb) as ReturnType<typeof rgb>;

  if (signatur.art === 'zeichnung') {
    const massstab = Math.min(rect.breite / UNTERSCHRIFT_BREITE, rect.hoehe / UNTERSCHRIFT_HOEHE);
    const x0 = rect.x;
    const y0 = rect.y + rect.hoehe;
    const punkt = ([px, py]: [number, number]) => ({
      x: x0 + px * massstab,
      y: y0 - py * massstab,
    });
    for (const strich of signatur.striche) {
      if (strich.length === 1) {
        seite.drawCircle({ ...punkt(strich[0]), size: 0.6, color: farbe });
        continue;
      }
      for (let i = 1; i < strich.length; i++) {
        seite.drawLine({
          start: punkt(strich[i - 1]),
          end: punkt(strich[i]),
          thickness: 1.3,
          color: farbe,
          lineCap: LineCapStyle.Round,
        });
      }
    }
    return;
  }

  const png = await schriftBild(signatur.text, signatur.font);
  if (png) {
    const bild: PDFImage = await dokument.embedPng(png);
    const massstab = Math.min(rect.breite / bild.width, rect.hoehe / bild.height);
    seite.drawImage(bild, {
      x: rect.x,
      y: rect.y,
      width: bild.width * massstab,
      height: bild.height * massstab,
    });
    return;
  }
  // Ohne Bild (kein Canvas): Notlösung in einer kursiven Standardschrift, damit nichts fehlt.
  const text = fuerStandardschrift(signatur.text, notschrift);
  let groesse = 16;
  while (groesse > 6 && notschrift.widthOfTextAtSize(text, groesse) > rect.breite) groesse--;
  seite.drawText(text, { x: rect.x, y: rect.y + 4, size: groesse, font: notschrift, color: farbe });
}

async function haengeBeiblattAn(
  dokument: PDFDocument,
  inhalt: SchadensmeldungInhalt,
  schrift: PDFFont,
  fett: PDFFont,
): Promise<void> {
  const seitenbreite = 595.28;
  const seitenhoehe = 841.89;
  const rand = 56;
  const groesse = 11;
  const zeilenhoehe = groesse * 1.35;
  const zeilen = bricheUm(
    fuerStandardschrift(inhalt.sachverhalt, schrift),
    schrift,
    groesse,
    seitenbreite - 2 * rand,
  );

  let seite = dokument.addPage([seitenbreite, seitenhoehe]);
  let y = seitenhoehe - rand;
  const text = (zeile: string, schriftart: PDFFont, g = groesse) => {
    seite.drawText(zeile, { x: rand, y, size: g, font: schriftart });
  };
  text('Beiblatt zur Schadens- und Verlustmeldung', fett, 14);
  y -= 24;
  const kopf = [
    `${MELDUNG_ART_LABEL[inhalt.art]} vom ${datumDeutsch(inhalt.datumFeststellung)}`,
    `${inhalt.bezeichnung}, Kennzeichen ${inhalt.kennzeichen}`,
    `Einheit: ${inhalt.einheit}`,
  ];
  for (const zeile of kopf) {
    text(fuerStandardschrift(zeile, schrift), schrift);
    y -= zeilenhoehe;
  }
  y -= zeilenhoehe / 2;
  text('Darstellung des Sachverhaltes:', fett);
  y -= zeilenhoehe * 1.2;
  for (const zeile of zeilen) {
    if (y < rand) {
      seite = dokument.addPage([seitenbreite, seitenhoehe]);
      y = seitenhoehe - rand;
    }
    text(zeile, schrift);
    y -= zeilenhoehe;
  }
}

/** Füllt die Vorlage und liefert das fertige PDF. Bricht ab, wenn die Vorlage nicht zum Formular passt. */
export async function schadensmeldungFuellen(
  vorlage: ArrayBuffer,
  daten: SchadensmeldungPdfDaten,
  optionen: FuellOptionen = {},
): Promise<Uint8Array> {
  const fehlend = await fehlendeFelder(vorlage);
  if (fehlend.length > 0) {
    throw new Error(
      `Die hinterlegte Vorlage passt nicht zum erwarteten Formular (es fehlt unter anderem „${fehlend[0]}“). Bitte im Verwaltungsbereich die passende Vorlage hinterlegen.`,
    );
  }
  const { StandardFonts } = await import('pdf-lib');
  const dokument = await ladePdf(vorlage);
  const formular = dokument.getForm();
  const schrift = await dokument.embedFont(StandardFonts.Helvetica);
  const fett = await dokument.embedFont(StandardFonts.HelveticaBold);
  const kursiv = await dokument.embedFont(StandardFonts.HelveticaOblique);
  const inhalt = daten.inhalt;

  const text = (name: string, wert: string, mehrzeilig = false): void => {
    // Einzeilige Felder bis 7 pt, mehrzeilige bis 8 pt: knapp, aber noch lesbar.
    setzeText(
      formular.getTextField(name),
      fuerStandardschrift(wert, schrift),
      schrift,
      mehrzeilig,
      mehrzeilig ? 8 : 7,
    );
  };

  text(FELD_DATUM, datumDeutsch(inhalt.datumFeststellung));
  text(FELD_EINHEIT, inhalt.einheit);
  text(FELD_BEZEICHNUNG, inhalt.bezeichnung);
  text(FELD_KENNZEICHEN, inhalt.kennzeichen);
  text(FELD_ORT, inhalt.ort, true);
  text(FELD_STELLUNGNAHME, inhalt.stellungnahme, true);
  text(FELD_EMPFEHLUNG, inhalt.empfehlung, true);

  const sachverhaltFeld = formular.getTextField(FELD_SACHVERHALT);
  const sachverhaltText = fuerStandardschrift(inhalt.sachverhalt, schrift);
  const beiblatt = !setzeText(
    sachverhaltFeld,
    sachverhaltText,
    schrift,
    true,
    SACHVERHALT_MIN_PT,
    false,
  );
  if (beiblatt) setzeText(sachverhaltFeld, 'Siehe Beiblatt (Seite 2).', schrift, true);

  formular.getCheckBox(KAESTCHEN[inhalt.art]).check();

  const seite = dokument.getPage(0);
  const rechterRand = feldRechteck(formular.getTextField(FELD_SACHVERHALT));
  const schriftBild = optionen.schriftBild ?? schriftAlsPng;
  const zeichnungen: {
    rect: { x: number; y: number; breite: number; hoehe: number };
    u: UnterschriftFuerPdf;
  }[] = [];
  for (const u of daten.unterschriften) {
    const felder = UNTERSCHRIFT_FELDER[u.slot];
    text(felder.name, u.name);
    text(felder.datum, datumDeutsch(u.datum));
    const datum = feldRechteck(formular.getTextField(felder.datum));
    const x = datum.x + datum.width + UNTERSCHRIFT_ABSTAND;
    zeichnungen.push({
      rect: {
        x,
        y: datum.y + 2,
        breite: rechterRand.x + rechterRand.width - x,
        hoehe: UNTERSCHRIFT_HOEHE_PT,
      },
      u,
    });
  }

  formular.updateFieldAppearances(schrift);
  if (optionen.flach !== false) formular.flatten();

  for (const { rect, u } of zeichnungen) {
    await zeichneUnterschrift(dokument, seite, rect, u.signatur, schriftBild, kursiv);
  }
  if (beiblatt) await haengeBeiblattAn(dokument, inhalt, schrift, fett);

  return dokument.save();
}
