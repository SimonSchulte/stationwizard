import type {
  Column,
  Content,
  ContentCanvas,
  ContentSection,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { PDF_FARBEN } from '../../kern/pdf/pdf-bibliothek';
import { AbschnittFarbe, DruckInhalt } from '../models/druck.model';
import { SCHILD_RAHMEN } from './abschnittsschild-rahmen';
import { jpegMasse } from './jpeg-masse';
import { baueLaufzettelStreifen, LaufzettelStreifen, seitenAufteilen } from './laufzettel-layout';
import {
  STREIFEN_STANDARD,
  gueltigeStreifenZahl,
  laufzettelMasse,
  laufzettelNummern,
} from './laufzettel-platz';
import { harterUmbruch } from './text-umbruch';

export interface DruckKopf {
  titel: string;
  /** Lokale Berliner Zeit `YYYY-MM-DDTHH:mm`, ohne Zone. */
  beginn: string | null;
  ende: string | null;
  ort: string | null;
}

/**
 * Maße in pt (1 mm = 72 / 25,4 pt). A4 quer = 841,89 × 595,28 pt; ein Streifen ist bei drei
 * je Seite 280,6 pt (99 mm) breit, bei vier bis sechs entsprechend schmaler (`streifenmass()`). Die Höhen entsprechen dem Canvas-Entwurf (Kopf 56 px, Material 23 × 20 px,
 * Infozeilen ~62 px, Handschrift ~90 px auf 794 px Höhe, 1 px = 0,75 pt); der Rest ist
 * Sicherheitsreserve, weil pdfmake bei Überlauf eine neue Seite anlegt.
 */
export const MASS = {
  seiteBreite: 841.89,
  seiteHoehe: 595.28,
  /** Breite bei drei Streifen je Seite; andere Zahlen rechnet `streifenmass()`. */
  streifenBreite: 280.6,
  klemmrand: 36.85,
  farbband: 5.67,
  innenLinks: 13,
  innenRechts: 11,
  kopf: 44,
  materialZeile: 15,
  ziel: 34,
  info: 14,
  schreibfeld: 52,
} as const;

/** Schriftgrößen in pt. Das Material ist so gewählt, dass 38 Zeichen in eine Zeile passen. */
export const SCHRIFT = {
  material: 9,
  anzahl: 9.5,
  info: 8,
  infoBeschriftung: 6.5,
  ziel: 10.5,
  zielBeschriftung: 6.5,
  klein: 6.5,
  ueberschrift: 10.5,
  nummer: 22,
} as const;

/** Breiten eines Streifens bei gewählter Zahl je Seite. */
export interface Streifenmass {
  streifenJeSeite: number;
  /** Breite des Streifens in pt. */
  breite: number;
  /** Nutzbare Breite innerhalb der Innenränder. */
  feld: number;
  /** Ab fünf Streifen: gestapelte Schreibfelder, schmale Nummer, gekürzte Klemmrand-Texte. */
  schmal: boolean;
}

export function streifenmass(streifenJeSeite: number = STREIFEN_STANDARD): Streifenmass {
  const zahl = gueltigeStreifenZahl(streifenJeSeite);
  const breite = MASS.seiteBreite / zahl;
  return {
    streifenJeSeite: zahl,
    breite,
    feld: breite - MASS.innenLinks - MASS.innenRechts,
    schmal: zahl >= 5,
  };
}

const FARBE_ABSCHNITT: Record<AbschnittFarbe, string> = {
  'abschnitt-1': PDF_FARBEN.abschnitt1,
  'abschnitt-2': PDF_FARBEN.abschnitt2,
  'abschnitt-3': PDF_FARBEN.abschnitt3,
  'abschnitt-4': PDF_FARBEN.abschnitt4,
  'abschnitt-5': PDF_FARBEN.abschnitt5,
  'abschnitt-6': PDF_FARBEN.abschnitt6,
  'abschnitt-7': PDF_FARBEN.abschnitt7,
  'abschnitt-8': PDF_FARBEN.abschnitt8,
};

/** Konkreter Farbwert der Abschnittsfarbe (pdfmake kennt keine CSS-Variablen). */
export function abschnittFarbeHex(farbe: AbschnittFarbe): string {
  return FARBE_ABSCHNITT[farbe];
}

const WOCHENTAGE = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'] as const;

const ZEITPUNKT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

interface Zeitpunkt {
  datum: string;
  zeit: string;
  wochentag: string;
}

/** Zerlegt `YYYY-MM-DDTHH:mm` ohne UTC-Umrechnung; unlesbare Werte ergeben `null`. */
function leseZeitpunkt(wert: string | null): Zeitpunkt | null {
  const treffer = wert ? ZEITPUNKT.exec(wert) : null;
  if (!treffer) return null;
  const [, jahr, monat, tag, stunde, minute] = treffer;
  const lokal = new Date(Number(jahr), Number(monat) - 1, Number(tag));
  return {
    datum: `${tag}.${monat}.${jahr}`,
    zeit: `${stunde}:${minute}`,
    wochentag: WOCHENTAGE[lokal.getDay()],
  };
}

/** „Sa., 05.12.2026, 10:00 – 20:00 Uhr“ bzw. über mehrere Tage ausgeschrieben; sonst leer. */
export function formatiereZeitraum(beginn: string | null, ende: string | null): string {
  const von = leseZeitpunkt(beginn);
  const bis = leseZeitpunkt(ende);
  if (!von) return bis ? `bis ${bis.wochentag}, ${bis.datum}, ${bis.zeit} Uhr` : '';
  const anfang = `${von.wochentag}, ${von.datum}, ${von.zeit}`;
  if (!bis) return `${anfang} Uhr`;
  if (bis.datum === von.datum) return `${anfang} – ${bis.zeit} Uhr`;
  return `${anfang} – ${bis.wochentag}, ${bis.datum}, ${bis.zeit} Uhr`;
}

function formatiereDruckzeit(zeitpunkt: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(zeitpunkt);
}

/** Oberer Abstand, der den Titel (geschätzte Zeilenzahl) im 54 pt hohen Kopfband zentriert. */
export function titelAbstand(titel: string, breite: number): number {
  const schrift = schildTitelSchrift(titel);
  const zeilen = Math.max(1, Math.ceil((titel.length * schrift * 0.56) / breite));
  return Math.max(0, (54 - zeilen * schrift) / 2);
}

/**
 * Lage und Größe des Rahmens ums Foto: rechtsbündig im Fotofeld, eng am Bild (Maße aus dem JPEG)
 * und höchstens so groß wie das Feld. Ohne Foto oder bei unlesbaren Maßen das ganze Feld.
 */
function fotoRahmen(foto: string | undefined): { x: number; breite: number; hoehe: number } {
  const innen = {
    b: SCHILD.fotoBreite - 2 * SCHILD.rahmen,
    h: SCHILD.fotoHoehe - 2 * SCHILD.rahmen,
  };
  const masse = foto ? jpegMasse(foto) : null;
  let breite = SCHILD.fotoBreite;
  let hoehe = SCHILD.fotoHoehe;
  if (masse) {
    const faktor = Math.min(innen.b / masse.breite, innen.h / masse.hoehe);
    breite = Math.round(masse.breite * faktor) + 2 * SCHILD.rahmen;
    hoehe = Math.round(masse.hoehe * faktor) + 2 * SCHILD.rahmen;
  }
  return { x: SCHILD.fotoX + SCHILD.fotoBreite - breite, breite, hoehe };
}

/** Kürzt auf `max` Zeichen mit Auslassungspunkt (nur für Klemmrand-Texte mit festem Platz). */
function kuerzen(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function keinRand() {
  return {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function kasten(hoehe: number, inhalt: Content): Content {
  return {
    table: { widths: ['*'], heights: [hoehe], body: [[inhalt]] },
    layout: keinRand(),
  };
}

function klemmrand(kopfTitel: string, streifen: LaufzettelStreifen, m: Streifenmass): Content {
  // 30 und 24 Zeichen passen auf den Streifen mit drei je Seite; schmalere Streifen kürzer.
  const anteil = m.feld / (MASS.streifenBreite - MASS.innenLinks - MASS.innenRechts);
  const maxTitel = Math.max(8, Math.round(30 * anteil));
  const maxAbschnitt = Math.max(6, Math.round(24 * anteil));
  return kasten(MASS.klemmrand, {
    margin: [0, 22, 0, 0],
    columns: [
      {
        width: '55%',
        text: kuerzen(kopfTitel, maxTitel),
        fontSize: 7.5,
        color: PDF_FARBEN.sekundaer,
      },
      {
        width: '45%',
        alignment: 'right',
        text: kuerzen(streifen.abschnitt.titel, maxAbschnitt),
        fontSize: 7.5,
        bold: true,
        color: PDF_FARBEN.text,
      },
    ],
  });
}

function kopfkasten(streifen: LaufzettelStreifen, m: Streifenmass): Content {
  const nummerBreite = m.schmal ? 40 : 56;
  const nummerGroesse = m.schmal ? 16 : SCHRIFT.nummer;
  const ueberschrift = streifen.ueberschrift.trim();
  const ueberschriftGroesse =
    (ueberschrift.length <= 40 ? SCHRIFT.ueberschrift : ueberschrift.length <= 80 ? 9 : 8) -
    (m.schmal ? 2 : 0);
  const links: Content = {
    margin: [m.schmal ? 3 : 5, 5, 3, 0],
    stack: [
      {
        text: 'AUFTRAG',
        fontSize: SCHRIFT.klein,
        bold: true,
        color: PDF_FARBEN.rot,
      },
      {
        text:
          harterUmbruch(ueberschrift, laufzettelMasse(m.streifenJeSeite).zeichenJeZielzeile) || ' ',
        bold: true,
        fontSize: ueberschriftGroesse,
        color: PDF_FARBEN.dunkelblau,
        margin: [0, 2, 0, 0],
      },
    ],
  };
  const nummer: Content[] = [
    {
      text: [
        { text: 'LfdNr ', fontSize: 7, color: PDF_FARBEN.sekundaer },
        { text: String(streifen.nr), fontSize: nummerGroesse, bold: true },
      ],
      color: PDF_FARBEN.dunkelblau,
    },
  ];
  if (streifen.istFortsetzung) {
    nummer.push({
      text: m.schmal ? '(Forts.)' : '(Fortsetzung)',
      fontSize: 6.5,
      bold: true,
      color: PDF_FARBEN.rot,
    });
  }
  return {
    table: {
      widths: ['*', nummerBreite],
      heights: [MASS.kopf],
      body: [[links, { stack: nummer, alignment: 'center', margin: [0, 5, 0, 0] }]],
    },
    layout: {
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      hLineColor: () => PDF_FARBEN.dunkelblau,
      vLineColor: () => PDF_FARBEN.dunkelblau,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

function kaestchen(farbe: string): Content {
  return {
    canvas: [{ type: 'rect', x: 0, y: 2.2, w: 8, h: 8, lineWidth: 0.7, lineColor: farbe }],
  };
}

/** Anzahlfeld: fett, rechtsbündig, mit „×“; leer als „__“. Lange Angaben schrumpfen. */
function anzahlFeld(anzahl: string): Content {
  const text = anzahl.trim();
  if (!text) {
    return {
      text: '__',
      alignment: 'right',
      color: PDF_FARBEN.platzhalter,
      fontSize: SCHRIFT.anzahl,
    };
  }
  const angezeigt = `${text}×`;
  const groesse = Math.max(5.5, Math.min(SCHRIFT.anzahl, 28 / (0.7 * angezeigt.length)));
  return { text: angezeigt, alignment: 'right', bold: true, fontSize: groesse, noWrap: true };
}

function materialRaster(streifen: LaufzettelStreifen, m: Streifenmass): Content {
  const umbruch = laufzettelMasse(m.streifenJeSeite).zeichenJeZeile;
  const zeilenHoehe = MASS.materialZeile;
  const lineHeight = zeilenHoehe / SCHRIFT.material / 1.17;
  const body: TableCell[][] = streifen.positionen.map((position): TableCell[] =>
    position.hinweis
      ? [
          { text: '!', bold: true, alignment: 'center', fontSize: SCHRIFT.material, lineHeight },
          {
            text: harterUmbruch(position.material, umbruch),
            colSpan: 2,
            italics: true,
            bold: true,
            fontSize: SCHRIFT.material,
            lineHeight,
            margin: [4, 0, 0, 0],
          },
          {},
        ]
      : [
          kaestchen(PDF_FARBEN.dunkelblau),
          anzahlFeld(position.anzahl),
          {
            text: harterUmbruch(position.material, umbruch),
            fontSize: SCHRIFT.material,
            lineHeight,
            margin: [4, 0, 0, 0],
          },
        ],
  );
  for (let i = 0; i < streifen.leereZeilen; i += 1) {
    body.push([kaestchen(PDF_FARBEN.hellgrau), { text: '' }, { text: '' }]);
  }
  return {
    margin: [0, 3, 0, 0],
    table: { widths: [10, 28, '*'], heights: () => zeilenHoehe, body },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => PDF_FARBEN.hellgrau,
      hLineStyle: () => ({ dash: { length: 1, space: 2 } }),
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

/** Breite der Beschriftungsspalte im Zielblock in pt. */
const ZIEL_BESCHRIFTUNG_BREITE = 34;
/** Höhe einer einzeiligen Zielzeile in pt. */
const ZIEL_ZEILE = 16;

/** Leere Schreiblinie in einer Tabellenzelle (statt „–“). */
function schreiblinie(breite: number, y: number): ContentCanvas {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: y,
        x2: breite,
        y2: y,
        lineWidth: 0.6,
        lineColor: PDF_FARBEN.beschriftung,
      },
    ],
  };
}

/**
 * Zielblock direkt unter dem Kopfkasten: „VON“ (Lagerort) und „AUF / IN“ (Transport mit) groß
 * und fett, damit eine helfende Person auf einen Blick sieht, wo sie das Material holt und
 * wohin sie es bringt. Fehlende Werte erscheinen als Schreiblinie.
 */
function zielBlock(streifen: LaufzettelStreifen, m: Streifenmass): Content {
  const feldBreite = m.feld;
  const wertBreite = feldBreite - ZIEL_BESCHRIFTUNG_BREITE;
  const umbruch = laufzettelMasse(m.streifenJeSeite).zeichenJeZielzeile;
  const zeile = (beschriftung: string, wert: string): Content[] => [
    {
      text: beschriftung,
      fontSize: SCHRIFT.zielBeschriftung,
      bold: true,
      color: PDF_FARBEN.rot,
      margin: [0, 5, 0, 0],
    },
    wert.trim()
      ? {
          text: harterUmbruch(wert.trim(), umbruch),
          fontSize: SCHRIFT.ziel,
          bold: true,
          margin: [0, 1.5, 0, 0],
        }
      : schreiblinie(wertBreite, 12),
  ];
  return {
    margin: [0, 3, 0, 0],
    table: {
      widths: [ZIEL_BESCHRIFTUNG_BREITE, '*'],
      heights: () => ZIEL_ZEILE,
      body: [zeile('VON', streifen.lagerort), zeile('AUF / IN', streifen.transportMit)],
    },
    layout: {
      hLineWidth: (i: number, k: { table: { body: unknown[] } }) =>
        i === 0 || i === k.table.body.length ? 0 : 0.4,
      vLineWidth: () => 0,
      hLineColor: () => PDF_FARBEN.hellgrau,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

/** „Rückfragen an“ als einzige kleine Infozeile unter dem Material. */
function rueckfragen(streifen: LaufzettelStreifen, m: Streifenmass): Content {
  const feldBreite = m.feld;
  return kasten(MASS.info, {
    margin: [0, 3, 0, 0],
    columns: [
      {
        width: 52,
        text: 'Rückfragen an',
        fontSize: SCHRIFT.infoBeschriftung,
        color: PDF_FARBEN.sekundaer,
        margin: [0, 2.5, 0, 0],
      },
      streifen.auftraggeber.trim()
        ? {
            width: '*',
            text: harterUmbruch(
              streifen.auftraggeber.trim(),
              laufzettelMasse(m.streifenJeSeite).zeichenJeInfozeile,
            ),
            fontSize: SCHRIFT.info,
          }
        : { width: '*', ...schreiblinie(feldBreite - 52, 9) },
    ],
  });
}

function schreibfelder(m: Streifenmass): Content {
  const linie = (breite: number): ContentCanvas => ({
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: breite,
        y2: 0,
        lineWidth: 0.6,
        lineColor: PDF_FARBEN.beschriftung,
      },
    ],
  });
  const feldBreite = m.feld;
  const ankreuz = (beschriftung: string, abstand = 0): Column => ({
    width: 'auto',
    columns: [
      {
        width: 11,
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 1,
            w: 8,
            h: 8,
            lineWidth: 0.7,
            lineColor: PDF_FARBEN.dunkelblau,
          },
        ],
      },
      { width: 'auto', text: beschriftung, fontSize: SCHRIFT.info },
    ],
    columnGap: 0,
    margin: [0, 0, abstand, 0],
  });
  return kasten(MASS.schreibfeld, {
    margin: [0, 3, 0, 0],
    stack: [
      { text: 'Durchführung von', fontSize: SCHRIFT.infoBeschriftung, color: PDF_FARBEN.sekundaer },
      { ...linie(feldBreite), margin: [0, 11, 0, 0] },
      // Ein einziger Haken: erledigt. Was nicht ging, steht unter „Bemerkung“.
      { margin: [0, 5, 0, 0], bold: true, columns: [ankreuz('Erledigt')] },
      {
        text: 'Bemerkung:',
        fontSize: SCHRIFT.infoBeschriftung,
        color: PDF_FARBEN.sekundaer,
        margin: [0, 4, 0, 0],
      },
      { ...linie(feldBreite), margin: [0, 7, 0, 0] },
      { ...linie(feldBreite), margin: [0, 8, 0, 0] },
    ],
  });
}

function streifenInhalt(
  kopfTitel: string,
  streifen: LaufzettelStreifen,
  laufzettelGesamt: number,
  seite: number,
  seitenGesamt: number,
  m: Streifenmass,
): Column {
  return {
    width: m.breite,
    margin: [MASS.innenLinks, 0, MASS.innenRechts, 0],
    stack: [
      klemmrand(kopfTitel, streifen, m),
      kopfkasten(streifen, m),
      zielBlock(streifen, m),
      materialRaster(streifen, m),
      rueckfragen(streifen, m),
      schreibfelder(m),
      {
        text: m.schmal
          ? `Nr. ${streifen.nr}/${laufzettelGesamt}${streifen.schild > 0 ? ` · Schild ${streifen.schild}` : ''} · S. ${seite}/${seitenGesamt}`
          : `Laufzettel ${streifen.nr} von ${laufzettelGesamt}${streifen.schild > 0 ? ` · Schild ${streifen.schild} von ${streifen.schildGesamt}` : ''} · Seite ${seite} von ${seitenGesamt}`,
        alignment: 'center',
        fontSize: 6.5,
        color: PDF_FARBEN.sekundaer,
        margin: [0, 4, 0, 0],
      },
    ],
  };
}

/** Grafik einer Laufzettelseite: gestrichelte Schnittlinien und je Streifen das Farbband. */
function seitenGrafik(streifenAufSeite: readonly LaufzettelStreifen[], m: Streifenmass): Content {
  const vektoren: ContentCanvas['canvas'] = [];
  for (let i = 1; i < m.streifenJeSeite; i += 1) {
    vektoren.push({
      type: 'line',
      x1: m.breite * i,
      y1: 0,
      x2: m.breite * i,
      y2: MASS.seiteHoehe,
      lineWidth: 0.5,
      lineColor: PDF_FARBEN.platzhalter,
      dash: { length: 4, space: 3 },
    });
  }
  streifenAufSeite.forEach((streifen, i) => {
    vektoren.push({
      type: 'rect',
      x: m.breite * i,
      y: MASS.klemmrand,
      w: MASS.farbband,
      h: MASS.seiteHoehe - MASS.klemmrand,
      color: FARBE_ABSCHNITT[streifen.abschnitt.farbe],
    });
  });
  return { canvas: vektoren, absolutePosition: { x: 0, y: 0 } };
}

/** Seitenränder der Anweisungsseiten in pt; die Laufzettelseiten haben keine (Streifen bis zum Rand). */
const ANWEISUNGEN_RAND = { links: 36, oben: 30, rechts: 36, unten: 40 } as const;

function anweisungsAbschnitt(
  kopf: DruckKopf,
  inhalt: DruckInhalt,
  gedrucktAm: Date,
): ContentSection {
  const zeitraum = formatiereZeitraum(kopf.beginn, kopf.ende);
  const ort = kopf.ort?.trim() ?? '';
  const laufzettel = inhalt.abschnitte.reduce((summe, a) => summe + a.laufzettel.length, 0);
  const breite = MASS.seiteBreite - ANWEISUNGEN_RAND.links - ANWEISUNGEN_RAND.rechts;
  const fussText = `${laufzettel} Laufzettel in ${inhalt.abschnitte.length} Abschnitten · gedruckt am ${formatiereDruckzeit(gedrucktAm)}`;
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [
      ANWEISUNGEN_RAND.links,
      ANWEISUNGEN_RAND.oben,
      ANWEISUNGEN_RAND.rechts,
      ANWEISUNGEN_RAND.unten,
    ],
    footer: {
      text: fussText,
      fontSize: 8,
      color: PDF_FARBEN.sekundaer,
      margin: [ANWEISUNGEN_RAND.links, 14, ANWEISUNGEN_RAND.rechts, 0],
    },
    section: [
      {
        text: 'Aufbau · Allgemeine Anweisungen',
        fontSize: 10,
        bold: true,
        color: PDF_FARBEN.rot,
      },
      {
        columns: [
          {
            width: '*',
            text: kopf.titel,
            fontSize: 24,
            bold: true,
            color: PDF_FARBEN.dunkelblau,
            margin: [0, 3, 12, 0],
          },
          {
            width: 220,
            alignment: 'right',
            margin: [0, 8, 0, 0],
            stack: [
              ...(zeitraum ? [{ text: zeitraum, fontSize: 11, bold: true }] : []),
              ...(ort ? [{ text: ort, fontSize: 10, color: PDF_FARBEN.sekundaer }] : []),
            ],
          },
        ],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: breite,
            y2: 0,
            lineWidth: 1.5,
            lineColor: PDF_FARBEN.blau,
          },
        ],
        margin: [0, 8, 0, 14],
      },
      // Der Freitext fließt wie in einer Zeitung durch zwei Spalten (und bei Bedarf auf
      // weitere Seiten); nur die erste Spalte trägt Inhalt.
      {
        columns: [
          { width: '*', text: inhalt.anweisungen.trim(), fontSize: 10, lineHeight: 1.2 },
          { width: '*', text: '' },
        ],
        columnGap: 28,
        snakingColumns: true,
      },
    ],
  };
}

/**
 * Schriftgröße des Abschnittstitels im Kopfband des Schilds; lange Titel werden kleiner und
 * laufen dann über zwei bis drei Zeilen (das Kopfband ist 54 pt hoch).
 */
export function schildTitelSchrift(titel: string): number {
  const laenge = titel.trim().length;
  if (laenge <= 14) return 34;
  if (laenge <= 28) return 28;
  if (laenge <= 60) return 20;
  if (laenge <= 120) return 14;
  return 11;
}

/**
 * Maße des Abschnittsschilds in pt. Vorlage ist die Word-Vorlage „Kistenbezeichnung“: A5 quer
 * (210 × 148,5 mm), zwei Schilder untereinander auf einem A4-Hochformatblatt. Die Lage der
 * Felder folgt dem Rahmenbild (`SCHILD_RAHMEN`): Kopfband bis 72 pt, Fußband ab 341 pt, rechts
 * daneben Platz für das Verladungsfoto.
 */
export const SCHILD = {
  breite: 595.28,
  hoehe: 420.94,
  rand: 26,
  kopfHoehe: 72,
  /** Obergrenze des Inhaltsfelds und linke Spalte; rechts davon liegt das Foto. */
  inhaltOben: 84,
  inhaltBreite: 350,
  fotoX: 393,
  fotoBreite: 180,
  fotoHoehe: 232,
  /** Dicke des Rahmens ums Foto. */
  rahmen: 5,
  gewichtY: 300,
  fussY: 347,
  fussBreite: 255,
} as const;

/** Kürzt auf `max` Zeichen mit Auslassungszeichen. */
export function kuerze(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Inhaltsliste eines Schilds: alle Laufzettel, die hier enden, je Zeile „Nr 3 · Überschrift ·
 * Lager“ (Nummer wie auf dem Laufzettel). Bis 12 Einträge einspaltig, darüber zweispaltig in
 * kleinerer Schrift; was nicht mehr passt, steht als „… und n weitere“. Die Zeilen stehen in
 * der Reihenfolge der Nummern.
 */
export function schildInhaltZeilen(
  abschnitt: DruckInhalt['abschnitte'][number],
  nummern: ReadonlyMap<string, number>,
): {
  spalten: string[][];
  schrift: number;
} {
  const einspaltig = abschnitt.laufzettel.length <= 12;
  const zeichen = einspaltig ? 58 : 36;
  const alle = abschnitt.laufzettel.map((l) => {
    const vorne = `Nr ${nummern.get(l.id) ?? 0} · `;
    const lager = l.lagerort.trim();
    const hinten = lager ? ` · ${kuerze(lager, 14)}` : '';
    const platz = Math.max(8, zeichen - vorne.length - hinten.length);
    return `${vorne}${kuerze(l.ueberschrift.trim() || 'Laufzettel', platz)}${hinten}`;
  });
  return schildSpalten(alle);
}

/** Ordnet fertige Inhaltszeilen eines Schilds: bis 12 einspaltig, darüber zweispaltig, Rest „… und n weitere“. */
export function schildSpalten(alle: readonly string[]): { spalten: string[][]; schrift: number } {
  const einspaltig = alle.length <= 12;
  const schrift = einspaltig ? 11 : 9;
  const zeichen = einspaltig ? 58 : 36;
  const kapazitaet = einspaltig ? 12 : 28;
  let zeilen = alle.map((z) => kuerze(z, zeichen));
  if (zeilen.length > kapazitaet) {
    const sichtbar = zeilen.slice(0, kapazitaet - 1);
    zeilen = [...sichtbar, `… und ${alle.length - sichtbar.length} weitere`];
  }
  if (einspaltig) return { spalten: [zeilen], schrift };
  const haelfte = Math.ceil(zeilen.length / 2);
  return { spalten: [zeilen.slice(0, haelfte), zeilen.slice(haelfte)], schrift };
}

/**
 * Ein Schild (A5 quer) an der senkrechten Stelle `y0` der Seite: Rahmenbild, Abschnittsfarbe
 * und Titel im Kopfband, links die Auftragsliste (Nr, Überschrift, Lager) rechts ein
 * etwaiges Verladungsfoto, darunter Gewicht zum Eintragen und im Fußband
 * Einsatz mit Zeitraum (Platz von „Geräteanhänger NRW 04“). Alles ist absolut positioniert, damit nichts
 * umbrechen kann.
 */
interface SchildDaten {
  titel: string;
  farbe: AbschnittFarbe;
  foto?: string;
  inhalt: { spalten: string[][]; schrift: number };
}

function schild(kopf: DruckKopf, daten: SchildDaten, y0: number): Content[] {
  const abschnitt = daten;
  const farbe = FARBE_ABSCHNITT[daten.farbe];
  const titel = daten.titel.trim();
  const zeitraum = formatiereZeitraum(kopf.beginn, kopf.ende);
  const inhalt = daten.inhalt;
  const spaltenBreite = SCHILD.inhaltBreite / inhalt.spalten.length;
  const textBreite = SCHILD.breite - 2 * SCHILD.rand;

  const feld = (
    x: number,
    y: number,
    breite: number,
    hoehe: number | null,
    zelle: Content,
  ): Content => ({
    table: {
      widths: [breite],
      ...(hoehe === null ? {} : { heights: [hoehe] }),
      body: [[zelle as TableCell]],
    },
    layout: keinRand(),
    absolutePosition: { x, y: y0 + y },
  });

  const bloecke: Content[] = [
    {
      image: SCHILD_RAHMEN,
      width: SCHILD.breite,
      height: SCHILD.hoehe,
      absolutePosition: { x: 0, y: y0 },
    },
    feld(SCHILD.rand, 9, textBreite, 54, {
      text: titel,
      margin: [0, titelAbstand(titel, textBreite), 0, 0],
      fontSize: schildTitelSchrift(titel),
      bold: true,
      lineHeight: 1,
      color: PDF_FARBEN.dunkelblau,
    }),
    {
      text: 'Inhalt:',
      fontSize: 11,
      bold: true,
      color: PDF_FARBEN.dunkelblau,
      absolutePosition: { x: SCHILD.rand, y: y0 + SCHILD.inhaltOben },
    },
    {
      columns: inhalt.spalten.map((zeilen) => ({
        width: spaltenBreite,
        stack: zeilen.map((zeile) => ({
          text: zeile,
          fontSize: inhalt.schrift,
          noWrap: true,
          lineHeight: 1.2,
          color: PDF_FARBEN.text,
        })),
      })),
      columnGap: 0,
      absolutePosition: { x: SCHILD.rand, y: y0 + SCHILD.inhaltOben + 18 },
    },
  ];
  // Die Abschnittsfarbe als Rahmen ums Verladungsfoto; ohne Foto bleibt der Rahmen leer.
  const rahmen = fotoRahmen(abschnitt.foto);
  bloecke.push({
    canvas: [
      {
        type: 'rect',
        x: SCHILD.rahmen / 2,
        y: SCHILD.rahmen / 2,
        w: rahmen.breite - SCHILD.rahmen,
        h: rahmen.hoehe - SCHILD.rahmen,
        lineWidth: SCHILD.rahmen,
        lineColor: farbe,
      },
    ],
    absolutePosition: { x: rahmen.x, y: y0 + SCHILD.inhaltOben },
  });
  if (abschnitt.foto) {
    bloecke.push({
      image: abschnitt.foto,
      fit: [rahmen.breite - 2 * SCHILD.rahmen, rahmen.hoehe - 2 * SCHILD.rahmen],
      absolutePosition: {
        x: rahmen.x + SCHILD.rahmen,
        y: y0 + SCHILD.inhaltOben + SCHILD.rahmen,
      },
    });
  }
  bloecke.push(
    {
      text: 'Gewicht:',
      fontSize: 14,
      color: PDF_FARBEN.dunkelblau,
      absolutePosition: { x: SCHILD.rand, y: y0 + SCHILD.gewichtY },
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: 120,
          y2: 0,
          lineWidth: 0.8,
          lineColor: PDF_FARBEN.dunkelblau,
        },
      ],
      absolutePosition: { x: SCHILD.rand + 70, y: y0 + SCHILD.gewichtY + 16 },
    },
    {
      text: 'kg',
      fontSize: 14,
      color: PDF_FARBEN.dunkelblau,
      absolutePosition: { x: SCHILD.rand + 196, y: y0 + SCHILD.gewichtY },
    },
    feld(SCHILD.rand, SCHILD.fussY, SCHILD.fussBreite, null, {
      stack: [
        {
          // Wie „Geräteanhänger NRW 04“ in der Vorlage: groß, fett, bis zu zwei Zeilen. Das Ziel
          // steht schon im Kopfband; unten steht der Einsatz.
          text: kuerze(kopf.titel.trim(), 52),
          fontSize: 16,
          bold: true,
          lineHeight: 1,
          color: PDF_FARBEN.dunkelblau,
        },
        ...(zeitraum
          ? [
              {
                text: kuerze(zeitraum, 60),
                fontSize: 8.5,
                margin: [0, 4, 0, 0] as [number, number, number, number],
                color: PDF_FARBEN.sekundaer,
              },
            ]
          : []),
      ],
    }),
  );
  return bloecke;
}

/** Gestrichelte Schnittlinie zwischen den zwei A5-Schildern eines A4-Hochformatblatts. */
export function schnittlinie(): Content {
  return {
    canvas: [
      {
        type: 'line' as const,
        x1: 0,
        y1: 0,
        x2: SCHILD.breite,
        y2: 0,
        lineWidth: 0.5,
        lineColor: PDF_FARBEN.platzhalter,
        dash: { length: 4, space: 3 },
      },
    ],
    absolutePosition: { x: 0, y: SCHILD.hoehe },
  };
}

/**
 * Abschnittsschilder: je A4-Hochformatblatt zwei Schilder im A5-Querformat untereinander.
 * Jede Seite beginnt mit einer unsichtbaren Fließzeile, damit pdfmake den Seitenumbruch
 * setzt, obwohl alle Schilder absolut positioniert sind.
 */
function schildSeiten(kopf: DruckKopf, inhalt: DruckInhalt): Content[] {
  const seiten: Content[] = [];
  const nummern = laufzettelNummern(inhalt);
  // Fertige Aushänge (Soll-Inhalt je Einheit) gehen vor der Zettelliste je Abschnitt.
  const schilder: SchildDaten[] = inhalt.schilder?.length
    ? inhalt.schilder.map((s) => ({
        titel: s.titel,
        farbe: s.farbe,
        ...(s.foto ? { foto: s.foto } : {}),
        inhalt: schildSpalten(s.zeilen),
      }))
    : inhalt.abschnitte.map((a) => ({
        titel: a.titel,
        farbe: a.farbe,
        ...(a.foto ? { foto: a.foto } : {}),
        inhalt: schildInhaltZeilen(a, nummern),
      }));
  for (let i = 0; i < schilder.length; i += 2) {
    const paar = schilder.slice(i, i + 2);
    seiten.push({
      ...(i > 0 ? { pageBreak: 'before' as const } : {}),
      stack: [
        { text: ' ', fontSize: 1 },
        ...paar.flatMap((a, j) => schild(kopf, a, j * SCHILD.hoehe)),
        ...(paar.length === 2 ? [schnittlinie()] : []),
      ],
    });
  }
  return seiten;
}

/**
 * Die Laufzettelseiten (A4 quer, 3 bis 6 Streifen je Seite) als eigener Abschnitt; `null` ohne
 * Streifen. Auch der Druck der Kistenzettel nutzt ihn (`kisten-pdf-definition.ts`).
 */
export function laufzettelAbschnitt(
  kopfTitel: string,
  streifen: readonly LaufzettelStreifen[],
  streifenJeSeite: number = STREIFEN_STANDARD,
  nummerGesamt?: number,
): ContentSection | null {
  const m = streifenmass(streifenJeSeite);
  const seiten = seitenAufteilen(streifen, m.streifenJeSeite);
  if (seiten.length === 0) return null;
  const laufzettelGesamt =
    nummerGesamt ?? streifen.reduce((hoechste, s) => Math.max(hoechste, s.nr), 0);
  const laufzettelSeiten: Content[] = seiten.map((seite, index) => {
    const spalten: Column[] = seite.map((s) =>
      streifenInhalt(kopfTitel, s, laufzettelGesamt, index + 1, seiten.length, m),
    );
    while (spalten.length < m.streifenJeSeite) {
      spalten.push({ width: m.breite, text: '' });
    }
    return {
      ...(index > 0 ? { pageBreak: 'before' as const } : {}),
      stack: [seitenGrafik(seite, m), { columns: spalten, columnGap: 0 }],
    };
  });
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [0, 0, 0, 0],
    section: laufzettelSeiten,
  };
}

/**
 * Pdfmake-Dokumentdefinition des Aufbaus: A4 quer, optional die Seite „Allgemeine Anweisungen“,
 * danach 3 bis 6 Laufzettelstreifen je Seite (Vorgabe 6), zuletzt die Abschnittsschilder
 * (A5 quer, zwei je A4-Hochformatblatt, Vorlage „Kistenbezeichnung“). Reine Funktion; Farben nur aus
 * `PDF_FARBEN`. Die Streifen müssen mit derselben Zahl gebaut sein (`baueLaufzettelStreifen()`).
 */
export function baueZettelPdfDefinition(
  kopf: DruckKopf,
  inhalt: DruckInhalt,
  streifen: readonly LaufzettelStreifen[],
  gedrucktAm: Date,
  streifenJeSeite: number = STREIFEN_STANDARD,
): TDocumentDefinitions {
  const abschnitte: ContentSection[] = [];
  if (inhalt.anweisungen.trim().length > 0) {
    abschnitte.push(anweisungsAbschnitt(kopf, inhalt, gedrucktAm));
  }
  // Die Packzettel setzen die Nummern der Laufzettel fort (1, 2, dann 3, 4 …), die Gesamtzahl gilt für beide.
  const anzahlLaufzettel = laufzettelNummern(inhalt).size;
  const packzettel = inhalt.kistenzettel?.length
    ? { anweisungen: '', abschnitte: inhalt.kistenzettel }
    : null;
  const anzahlPackzettel = packzettel ? laufzettelNummern(packzettel).size : 0;
  const nummerGesamt = anzahlPackzettel > 0 ? anzahlLaufzettel + anzahlPackzettel : undefined;
  const laufzettel = laufzettelAbschnitt(kopf.titel, streifen, streifenJeSeite, nummerGesamt);
  if (laufzettel) abschnitte.push(laufzettel);

  if (packzettel) {
    // Eigener Abschnitt; das Abschnittsschild des Aufbaus ist hier ohne Bedeutung.
    const kistenStreifen = baueLaufzettelStreifen(
      packzettel,
      streifenJeSeite,
      'abschnitt',
      anzahlLaufzettel,
    ).map((s) => ({ ...s, schild: 0, schildGesamt: 0 }));
    const kisten = laufzettelAbschnitt('Packzettel', kistenStreifen, streifenJeSeite, nummerGesamt);
    if (kisten) abschnitte.push(kisten);
  }

  if (inhalt.abschnitte.length > 0 || inhalt.schilder?.length) {
    abschnitte.push({
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [0, 0, 0, 0],
      section: schildSeiten(kopf, inhalt),
    });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    info: { title: `Aufbau ${kopf.titel}` },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_FARBEN.text },
    content: abschnitte,
  };
}
