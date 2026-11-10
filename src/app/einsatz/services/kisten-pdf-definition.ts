import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PDF_FARBEN } from '../../kern/pdf/pdf-bibliothek';
import { Artikel, Kiste, KistenPosition, Lager } from '../models/stammdaten.model';
import { DruckInhalt, DruckLaufzettel } from '../models/druck.model';
import { SCHILD_RAHMEN } from './abschnittsschild-rahmen';
import { baueLaufzettelStreifen } from './laufzettel-layout';
import { STREIFEN_STANDARD } from './laufzettel-platz';
import {
  keinRand,
  kuerze,
  laufzettelAbschnitt,
  schnittlinie,
  SCHILD,
  schildTitelSchrift,
  titelAbstand,
} from './zettel-pdf-definition';

/**
 * Druck der Kisten (Stufe 2 der Packeinheiten, `docs/konzept-packeinheiten.md`): das **Kistenschild**
 * (A5 quer nach der Vorlage „Kistenbezeichnung“, zwei je A4-Hochformatblatt) und der **Kistenzettel**
 * (ein Laufzettelstreifen je Kiste). Ohne Aufbau gibt es weder Ziel noch Einsatz: das Schild trägt
 * unten das Heimatlager, der Rahmen ist dunkelblau, der Zettel hat ein neutrales Farbband und
 * eine Schreiblinie bei „Auf / In“. Stufe 3 setzt hier Zielfarbe und Einsatz ein.
 */

export interface KistenDruckDaten {
  artikel: ReadonlyMap<string, Pick<Artikel, 'name' | 'einheit'>>;
  lager: ReadonlyMap<string, Pick<Lager, 'name'>>;
}

/** Menge mit deutschem Dezimalkomma, ohne überflüssige Nachkommastellen: 2,5 / 85 / 0,125. */
export function mengeText(menge: number): string {
  return String(Math.round(menge * 1000) / 1000).replace('.', ',');
}

/** Artikelname einer Position; ein unbekannter Artikel bleibt als Hinweis sichtbar. */
function artikelName(position: KistenPosition, daten: KistenDruckDaten): string {
  return daten.artikel.get(position.artikelId)?.name ?? '(Artikel fehlt)';
}

/**
 * Zeile der Inhaltsliste auf dem Schild: „3× Pfeffer, Dose“, „85 Liter Glühwein“,
 * „1 Packung Salz“; eine Bemerkung steht in Klammern dahinter.
 */
export function kistenZeile(position: KistenPosition, daten: KistenDruckDaten): string {
  return schildZeile({
    name: artikelName(position, daten),
    einheit: daten.artikel.get(position.artikelId)?.einheit ?? 'Stück',
    menge: position.menge,
    bemerkung: position.bemerkung,
  });
}

/** Zeile aus fertigen Angaben; „Stück“ und leere Einheit stehen als „3×“. */
export function schildZeile(p: {
  name: string;
  einheit: string;
  menge: number;
  bemerkung: string;
}): string {
  const einheit = p.einheit.trim();
  const menge =
    einheit === '' || einheit === 'Stück'
      ? `${mengeText(p.menge)}×`
      : `${mengeText(p.menge)} ${einheit}`;
  const bemerkung = p.bemerkung.trim();
  return `${menge} ${p.name}${bemerkung ? ` (${bemerkung})` : ''}`;
}

/** Was ein Kistenschild trägt; aus einer Stammdaten-Kiste oder aus dem Aufbau abgeleitet. */
export interface Kistenschild {
  titel: string;
  heimatlager: string;
  zeilen: string[];
  /** Rahmenfarbe des Inhaltsfelds; ohne Angabe das neutrale Dunkelblau. */
  rahmenFarbe?: string;
}

/** Spalten und Schrift der Inhaltsliste eines Kistenschilds; Überlanges endet mit „… und n weitere“. */
export function kistenschildSpalten(zeilen: readonly string[]): {
  spalten: string[][];
  schrift: number;
} {
  const stufe =
    zeilen.length <= 12
      ? { spalten: 1, schrift: 12, kapazitaet: 12, zeichen: 80 }
      : zeilen.length <= 30
        ? { spalten: 2, schrift: 10, kapazitaet: 30, zeichen: 48 }
        : { spalten: 3, schrift: 8, kapazitaet: 57, zeichen: 38 };
  let sichtbar = zeilen.map((z) => kuerze(z, stufe.zeichen));
  if (sichtbar.length > stufe.kapazitaet) {
    const bleibt = sichtbar.slice(0, stufe.kapazitaet - 1);
    sichtbar = [...bleibt, `… und ${zeilen.length - bleibt.length} weitere`];
  }
  const proSpalte = Math.ceil(sichtbar.length / stufe.spalten);
  const spalten = Array.from({ length: stufe.spalten }, (_, i) =>
    sichtbar.slice(i * proSpalte, (i + 1) * proSpalte),
  ).filter((spalte) => spalte.length > 0);
  return { spalten: spalten.length > 0 ? spalten : [[]], schrift: stufe.schrift };
}

const INHALT_X = SCHILD.rand - 6;
const INHALT_Y = 80;
const INHALT_BREITE = SCHILD.breite - 2 * INHALT_X;
const INHALT_HOEHE = 216;
const RAHMEN_DICKE = 3;

function kistenschild(schild: Kistenschild, y0: number): Content[] {
  const titel = schild.titel.trim();
  const rahmenFarbe = schild.rahmenFarbe ?? PDF_FARBEN.dunkelblau;
  const textBreite = SCHILD.breite - 2 * SCHILD.rand;
  const heimatlager = schild.heimatlager;
  const { spalten, schrift } = kistenschildSpalten(schild.zeilen);
  const spaltenBreite = (INHALT_BREITE - 2 * 8) / spalten.length;

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

  return [
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
      // Inhaltsfeld mit Rahmen (Stufe 3: in der Farbe des Ziels).
      canvas: [
        {
          type: 'rect',
          x: RAHMEN_DICKE / 2,
          y: RAHMEN_DICKE / 2,
          w: INHALT_BREITE - RAHMEN_DICKE,
          h: INHALT_HOEHE - RAHMEN_DICKE,
          lineWidth: RAHMEN_DICKE,
          lineColor: rahmenFarbe,
        },
      ],
      absolutePosition: { x: INHALT_X, y: y0 + INHALT_Y },
    },
    {
      text: 'Inhalt:',
      fontSize: 11,
      bold: true,
      color: PDF_FARBEN.dunkelblau,
      absolutePosition: { x: INHALT_X + 10, y: y0 + INHALT_Y + 8 },
    },
    {
      columns: spalten.map((zeilen) => ({
        width: spaltenBreite,
        stack: zeilen.map((zeile) => ({
          text: zeile,
          fontSize: schrift,
          noWrap: true,
          lineHeight: 1.2,
          color: PDF_FARBEN.text,
        })),
      })),
      columnGap: 0,
      absolutePosition: { x: INHALT_X + 10, y: y0 + INHALT_Y + 26 },
    },
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
        { text: 'Heimatlager', fontSize: 8.5, color: PDF_FARBEN.sekundaer },
        {
          text: heimatlager ? kuerze(heimatlager, 40) : '–',
          fontSize: 16,
          bold: true,
          lineHeight: 1,
          margin: [0, 2, 0, 0] as [number, number, number, number],
          color: PDF_FARBEN.dunkelblau,
        },
      ],
    }),
  ];
}

/** Kistenschilder: je A4-Hochformatblatt zwei im A5-Querformat, dazwischen die Schnittlinie. */
export function baueSchilderDefinition(
  schilder: readonly Kistenschild[],
  titel: string,
): TDocumentDefinitions {
  const seiten: Content[] = [];
  for (let i = 0; i < schilder.length; i += 2) {
    const paar = schilder.slice(i, i + 2);
    seiten.push({
      ...(i > 0 ? { pageBreak: 'before' as const } : {}),
      stack: [
        { text: ' ', fontSize: 1 },
        ...paar.flatMap((schild, j) => kistenschild(schild, j * SCHILD.hoehe)),
        ...(paar.length === 2 ? [schnittlinie()] : []),
      ],
    });
  }
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [0, 0, 0, 0],
    info: { title: titel },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_FARBEN.text },
    content: seiten,
  };
}

/** Kistenschilder der Stammdaten-Kisten. */
export function baueKistenschildDefinition(
  kisten: readonly Kiste[],
  daten: KistenDruckDaten,
  rahmenFarbe: string = PDF_FARBEN.dunkelblau,
): TDocumentDefinitions {
  return baueSchilderDefinition(
    kisten.map((kiste) => ({
      titel: kiste.name,
      heimatlager: (kiste.lagerId && daten.lager.get(kiste.lagerId)?.name) || '',
      zeilen: kiste.inhalt.map((p) => kistenZeile(p, daten)),
      rahmenFarbe,
    })),
    kisten.length === 1 ? `Kistenschild ${kisten[0].name}` : 'Kistenschilder',
  );
}

/**
 * Kistenzettel: je Kiste ein Laufzettelstreifen („<Kiste> packen“) mit dem Heimatlager als „Von“.
 * Der Aufbau der Streifen (Nummern, Raster, Fortsetzung bei zu vielen Positionen) kommt aus
 * `baueLaufzettelStreifen()`; die Nummer zählt in der Reihenfolge der übergebenen Kisten.
 */
export function baueKistenzettelDefinition(
  kisten: readonly Kiste[],
  daten: KistenDruckDaten,
  streifenJeSeite: number = STREIFEN_STANDARD,
): TDocumentDefinitions {
  const laufzettel: DruckLaufzettel[] = kisten.map((kiste) => ({
    id: kiste.id,
    herkunftId: null,
    ueberschrift: `${kiste.name} packen`,
    lagerort: (kiste.lagerId && daten.lager.get(kiste.lagerId)?.name) || '',
    transportMit: '',
    auftraggeber: '',
    fachgruppe: null,
    positionen: kiste.inhalt.map((position) => {
      const artikel = daten.artikel.get(position.artikelId);
      const bemerkung = position.bemerkung.trim();
      const einheit = artikel && artikel.einheit !== 'Stück' ? ` (${artikel.einheit})` : '';
      return {
        id: `${kiste.id}:${position.artikelId}`,
        herkunftId: null,
        anzahl: mengeText(position.menge),
        material: `${artikelName(position, daten)}${einheit}${bemerkung ? ` – ${bemerkung}` : ''}`,
      };
    }),
  }));
  const inhalt: DruckInhalt = {
    anweisungen: '',
    abschnitte: [
      {
        id: 'kisten',
        herkunftId: null,
        // Leer: „Auf / In“ bleibt eine Schreiblinie, es gibt noch kein Ziel.
        titel: '',
        farbe: 'abschnitt-2',
        fachgruppe: null,
        laufzettel,
      },
    ],
  };
  return baueKistenzettelAusInhalt(
    inhalt,
    kisten.length === 1 ? `Kistenzettel ${kisten[0].name}` : 'Kistenzettel',
    streifenJeSeite,
  );
}

/**
 * Kistenzettel aus fertigem Druckinhalt (ein Abschnitt je Ziel, ein Laufzettel je Kiste). Das Schild
 * des Abschnitts ist hier nicht das Abschnittsschild des Aufbaus; seine Nummer bleibt aus dem Fuß weg.
 */
export function baueKistenzettelAusInhalt(
  inhalt: DruckInhalt,
  titel: string,
  streifenJeSeite: number = STREIFEN_STANDARD,
): TDocumentDefinitions {
  const streifen = baueLaufzettelStreifen(inhalt, streifenJeSeite).map((s) => ({
    ...s,
    schild: 0,
    schildGesamt: 0,
  }));
  const abschnitt = laufzettelAbschnitt('Kistenzettel', streifen, streifenJeSeite);
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    info: { title: titel },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_FARBEN.text },
    content: abschnitt ? [abschnitt] : [],
  };
}
