import type {
  Column,
  Content,
  ContentCanvas,
  ContentSection,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { Fachgruppe } from '../../kern/fachgruppen/fachgruppe';
import { PDF_FARBEN } from '../../kern/pdf/pdf-bibliothek';
import { AbschnittFarbe, VbInhalt } from '../models/vb.model';
import { LaufzettelStreifen, seitenAufteilen } from './laufzettel-layout';
import { STREIFEN_STANDARD, gueltigeStreifenZahl } from './laufzettel-platz';

export interface VbDruckKopf {
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

const FARBE_FACHGRUPPE: Record<Fachgruppe, string> = {
  sanitaet: PDF_FARBEN.katSan,
  betreuung: PDF_FARBEN.katBtvp,
  verpflegung: PDF_FARBEN.katBtvp,
  tesi: PDF_FARBEN.katTesi,
  fuehrung: PDF_FARBEN.katFuehrung,
};

const FACHGRUPPE_TEXT: Record<Fachgruppe, string> = {
  sanitaet: 'Sanität',
  betreuung: 'Betreuung',
  verpflegung: 'Verpflegung',
  tesi: 'TeSi',
  fuehrung: 'Führung',
};

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

/** Kürzt auf `max` Zeichen mit Auslassungspunkt (nur für Klemmrand-Texte mit festem Platz). */
function kuerzen(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function keinRand() {
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
  const farbe = FARBE_ABSCHNITT[streifen.abschnitt.farbe];
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
        columns: [
          { width: '*', text: '' },
          {
            width: 8,
            canvas: [{ type: 'ellipse', x: 3, y: 4.2, r1: 3, r2: 3, color: farbe }],
          },
          {
            width: 'auto',
            text: kuerzen(streifen.abschnitt.titel, maxAbschnitt),
            fontSize: 7.5,
            bold: true,
            color: PDF_FARBEN.text,
          },
        ],
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
  const kennzeichen: Column[] = [
    {
      width: 'auto',
      text: 'AUFTRAG',
      fontSize: SCHRIFT.klein,
      bold: true,
      color: PDF_FARBEN.rot,
      margin: [0, 1.5, 5, 0],
    },
  ];
  if (streifen.fachgruppe) {
    kennzeichen.push({
      width: 'auto',
      table: {
        body: [
          [
            {
              text: FACHGRUPPE_TEXT[streifen.fachgruppe],
              fontSize: 7,
              bold: true,
              color: PDF_FARBEN.weiss,
              fillColor: FARBE_FACHGRUPPE[streifen.fachgruppe],
              margin: [4, 1, 4, 1],
            },
          ],
        ],
      },
      layout: keinRand(),
    });
  }
  const links: Content = {
    margin: [m.schmal ? 3 : 5, 5, 3, 0],
    stack: [
      // Auf schmalen Streifen stehen „AUFTRAG“ und die Fachgruppe übereinander.
      m.schmal ? { stack: kennzeichen } : { columns: kennzeichen, columnGap: 0 },
      {
        text: ueberschrift || ' ',
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

function materialRaster(streifen: LaufzettelStreifen): Content {
  const zeilenHoehe = MASS.materialZeile;
  const lineHeight = zeilenHoehe / SCHRIFT.material / 1.17;
  const body: Content[][] = streifen.positionen.map((position) => [
    kaestchen(PDF_FARBEN.dunkelblau),
    anzahlFeld(position.anzahl),
    {
      text: position.material,
      fontSize: SCHRIFT.material,
      lineHeight,
      margin: [4, 0, 0, 0],
    },
  ]);
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
  const zeile = (beschriftung: string, wert: string): Content[] => [
    {
      text: beschriftung,
      fontSize: SCHRIFT.zielBeschriftung,
      bold: true,
      color: PDF_FARBEN.rot,
      margin: [0, 5, 0, 0],
    },
    wert.trim()
      ? { text: wert.trim(), fontSize: SCHRIFT.ziel, bold: true, margin: [0, 1.5, 0, 0] }
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
        ? { width: '*', text: streifen.auftraggeber.trim(), fontSize: SCHRIFT.info }
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
      // Auf schmalen Streifen steht „Durchgeführt“ über den beiden Kästchen statt davor.
      m.schmal
        ? {
            margin: [0, 5, 0, 0],
            stack: [
              { text: 'Durchgeführt', fontSize: SCHRIFT.info, bold: true },
              {
                margin: [0, 2, 0, 0],
                columns: [ankreuz('Ja', 8), ankreuz('nicht möglich')],
              },
            ],
          }
        : {
            margin: [0, 5, 0, 0],
            columns: [
              {
                width: 'auto',
                text: 'Durchgeführt',
                fontSize: SCHRIFT.info,
                bold: true,
                margin: [0, 0, 8, 0],
              },
              ankreuz('Ja', 8),
              ankreuz('nicht möglich'),
            ],
          },
      {
        text: 'Grund:',
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
      materialRaster(streifen),
      rueckfragen(streifen, m),
      schreibfelder(m),
      {
        text: m.schmal
          ? `Nr. ${streifen.nr}/${laufzettelGesamt} · S. ${seite}/${seitenGesamt}`
          : `Laufzettel ${streifen.nr} von ${laufzettelGesamt} · Seite ${seite} von ${seitenGesamt}`,
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
  kopf: VbDruckKopf,
  inhalt: VbInhalt,
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
        text: 'Vorbereitung · Allgemeine Anweisungen',
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

/** Schriftgröße des Abschnittstitels auf dem Kennzeichnungsschild; lange Titel werden kleiner. */
export function schildTitelSchrift(titel: string): number {
  const laenge = titel.trim().length;
  if (laenge <= 14) return 96;
  if (laenge <= 28) return 68;
  if (laenge <= 60) return 44;
  if (laenge <= 120) return 32;
  return 24;
}

const SCHILD_RAND = 48;
const SCHILD_BAND = 44;

/**
 * Kennzeichnungsschild eines Abschnitts: eine A4-Querseite, Farbbänder oben und unten in der
 * Abschnittsfarbe, der Titel groß in der Mitte, darunter die Fachgruppe; Veranstaltung und
 * Zeitraum stehen unten. Die Seite besteht ausschließlich aus Fließinhalt mit festen Abständen,
 * damit pdfmake sie nie auf eine zweite Seite umbricht.
 */
function kennzeichnungsschild(
  kopf: VbDruckKopf,
  abschnitt: VbInhalt['abschnitte'][number],
  nummer: number,
  gesamt: number,
  erste: boolean,
): Content {
  const farbe = FARBE_ABSCHNITT[abschnitt.farbe];
  const titel = abschnitt.titel.trim();
  const schrift = schildTitelSchrift(titel);
  const zeitraum = formatiereZeitraum(kopf.beginn, kopf.ende);
  const ort = kopf.ort?.trim() ?? '';
  const breite = MASS.seiteBreite - 2 * SCHILD_RAND;
  const veranstaltung = [kopf.titel, zeitraum, ort].filter((t) => t !== '').join(' · ');
  return {
    ...(erste ? {} : { pageBreak: 'before' as const }),
    stack: [
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: MASS.seiteBreite, h: SCHILD_BAND, color: farbe },
          {
            type: 'rect',
            x: 0,
            y: MASS.seiteHoehe - SCHILD_BAND,
            w: MASS.seiteBreite,
            h: SCHILD_BAND,
            color: farbe,
          },
        ],
        absolutePosition: { x: 0, y: 0 },
      },
      {
        text: `ABSCHNITT ${nummer} VON ${gesamt}`,
        fontSize: 12,
        bold: true,
        characterSpacing: 2,
        alignment: 'center',
        color: PDF_FARBEN.sekundaer,
        margin: [SCHILD_RAND, SCHILD_BAND + 56, SCHILD_RAND, 0],
      },
      {
        text: titel,
        fontSize: schrift,
        bold: true,
        alignment: 'center',
        lineHeight: 1.05,
        color: PDF_FARBEN.dunkelblau,
        margin: [SCHILD_RAND, 40, SCHILD_RAND, 0],
      },
      ...(abschnitt.fachgruppe
        ? [
            {
              text: FACHGRUPPE_TEXT[abschnitt.fachgruppe],
              fontSize: 32,
              bold: true,
              alignment: 'center' as const,
              color: FARBE_FACHGRUPPE[abschnitt.fachgruppe],
              margin: [SCHILD_RAND, 28, SCHILD_RAND, 0] as [number, number, number, number],
            },
          ]
        : []),
      {
        table: {
          widths: [breite],
          body: [
            [
              {
                text: veranstaltung,
                fontSize: 13,
                alignment: 'center',
                color: PDF_FARBEN.sekundaer,
              },
            ],
          ],
        },
        layout: keinRand(),
        absolutePosition: { x: SCHILD_RAND, y: MASS.seiteHoehe - SCHILD_BAND - 38 },
      },
    ],
  };
}

/**
 * Seite „Verladung“ eines Abschnitts mit dessen Foto: Farbbänder wie auf dem Schild, Titel
 * oben, das Foto einbehalten im Seitenverhältnis (`fit`) darunter. Fester Fließinhalt, damit
 * die Seite nie umbricht.
 */
function verladungsfoto(abschnitt: VbInhalt['abschnitte'][number], foto: string): Content {
  const farbe = FARBE_ABSCHNITT[abschnitt.farbe];
  const breite = MASS.seiteBreite - 2 * SCHILD_RAND;
  const hoehe = MASS.seiteHoehe - 2 * SCHILD_BAND - 120;
  return {
    pageBreak: 'before' as const,
    stack: [
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: MASS.seiteBreite, h: SCHILD_BAND, color: farbe },
          {
            type: 'rect',
            x: 0,
            y: MASS.seiteHoehe - SCHILD_BAND,
            w: MASS.seiteBreite,
            h: SCHILD_BAND,
            color: farbe,
          },
        ],
        absolutePosition: { x: 0, y: 0 },
      },
      {
        text: `VERLADUNG · ${abschnitt.titel.trim()}`,
        fontSize: 20,
        bold: true,
        alignment: 'center',
        color: PDF_FARBEN.dunkelblau,
        margin: [SCHILD_RAND, SCHILD_BAND + 20, SCHILD_RAND, 16],
      },
      { image: foto, fit: [breite, hoehe], alignment: 'center' },
    ],
  };
}

/**
 * Pdfmake-Dokumentdefinition der VB: A4 quer, optional die Seite „Allgemeine Anweisungen“,
 * danach 3 bis 6 Laufzettelstreifen je Seite (Vorgabe 6), zuletzt je Abschnitt ein
 * Kennzeichnungsschild (eine A4-Querseite). Reine Funktion; Farben nur aus
 * `PDF_FARBEN`. Die Streifen müssen mit derselben Zahl gebaut sein (`baueLaufzettelStreifen()`).
 */
export function baueVbPdfDefinition(
  kopf: VbDruckKopf,
  inhalt: VbInhalt,
  streifen: readonly LaufzettelStreifen[],
  gedrucktAm: Date,
  streifenJeSeite: number = STREIFEN_STANDARD,
): TDocumentDefinitions {
  const m = streifenmass(streifenJeSeite);
  const seiten = seitenAufteilen(streifen, m.streifenJeSeite);
  const laufzettelGesamt = streifen.reduce((hoechste, s) => Math.max(hoechste, s.nr), 0);
  const abschnitte: ContentSection[] = [];
  if (inhalt.anweisungen.trim().length > 0) {
    abschnitte.push(anweisungsAbschnitt(kopf, inhalt, gedrucktAm));
  }

  const laufzettelSeiten: Content[] = seiten.map((seite, index) => {
    const spalten: Column[] = seite.map((s) =>
      streifenInhalt(kopf.titel, s, laufzettelGesamt, index + 1, seiten.length, m),
    );
    while (spalten.length < m.streifenJeSeite) {
      spalten.push({ width: m.breite, text: '' });
    }
    return {
      ...(index > 0 ? { pageBreak: 'before' as const } : {}),
      stack: [seitenGrafik(seite, m), { columns: spalten, columnGap: 0 }],
    };
  });
  if (laufzettelSeiten.length > 0) {
    abschnitte.push({
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [0, 0, 0, 0],
      section: laufzettelSeiten,
    });
  }

  if (inhalt.abschnitte.length > 0) {
    abschnitte.push({
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [0, 0, 0, 0],
      section: inhalt.abschnitte.flatMap((a, i) => [
        kennzeichnungsschild(kopf, a, i + 1, inhalt.abschnitte.length, i === 0),
        ...(a.foto ? [verladungsfoto(a, a.foto)] : []),
      ]),
    });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    info: { title: `VB ${kopf.titel}` },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_FARBEN.text },
    content: abschnitte,
  };
}
