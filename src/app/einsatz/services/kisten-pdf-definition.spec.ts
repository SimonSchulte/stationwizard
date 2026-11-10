import type { ContentSection, TDocumentDefinitions } from 'pdfmake/interfaces';
import { describe, expect, it } from 'vitest';
import { PDF_FARBEN } from '../../kern/pdf/pdf-bibliothek';
import { Artikel, Kiste } from '../models/stammdaten.model';
import { erzeugeTestKiste } from '../testing/stammdaten-testdaten';
import {
  baueKistenschildDefinition,
  baueKistenzettelDefinition,
  kistenschildSpalten,
  kistenZeile,
  KistenDruckDaten,
  mengeText,
} from './kisten-pdf-definition';
import { SCHILD } from './zettel-pdf-definition';

const artikel = new Map<string, Pick<Artikel, 'name' | 'einheit'>>([
  ['oel', { name: 'Öl', einheit: 'Liter' }],
  ['dose', { name: 'Pfeffer, Dose', einheit: 'Stück' }],
  ['salz', { name: 'Salz', einheit: 'Packung' }],
]);
const lager = new Map([['l1', { name: 'Küchenlager' }]]);
const daten: KistenDruckDaten = { artikel, lager };

const position = (artikelId: string, menge: number, bemerkung = '') => ({
  artikelId,
  menge,
  bemerkung,
});

const gewuerz = erzeugeTestKiste({
  name: 'Gewürzkiste',
  lagerId: 'l1',
  inhalt: [position('oel', 1, 'voll'), position('dose', 3), position('salz', 2.5)],
});

/** Alle Textbausteine eines Knotenbaums, in Dokumentreihenfolge. */
function alleTexte(knoten: unknown, ergebnis: string[] = []): string[] {
  if (typeof knoten === 'string') ergebnis.push(knoten);
  else if (Array.isArray(knoten)) knoten.forEach((k) => alleTexte(k, ergebnis));
  else if (knoten && typeof knoten === 'object') {
    for (const [schluessel, wert] of Object.entries(knoten)) {
      if (['text', 'stack', 'columns', 'table', 'body', 'section'].includes(schluessel)) {
        alleTexte(wert, ergebnis);
      }
    }
  }
  return ergebnis;
}

function seiten(definition: TDocumentDefinitions): { pageBreak?: string; stack: unknown[] }[] {
  return definition.content as { pageBreak?: string; stack: unknown[] }[];
}

describe('mengeText', () => {
  it.each([
    [1, '1'],
    [2.5, '2,5'],
    [0.125, '0,125'],
    [85, '85'],
    [0.1 + 0.2, '0,3'],
  ])('schreibt %s als %s', (menge, erwartet) => {
    expect(mengeText(menge)).toBe(erwartet);
  });
});

describe('kistenZeile', () => {
  it('schreibt Stück mit „×“, andere Einheiten ausgeschrieben, Bemerkung in Klammern', () => {
    expect(kistenZeile(position('dose', 3), daten)).toBe('3× Pfeffer, Dose');
    expect(kistenZeile(position('oel', 1, 'voll'), daten)).toBe('1 Liter Öl (voll)');
    expect(kistenZeile(position('salz', 2.5), daten)).toBe('2,5 Packung Salz');
  });

  it('lässt einen unbekannten Artikel sichtbar statt ihn wegzulassen', () => {
    expect(kistenZeile(position('weg', 1), daten)).toBe('1× (Artikel fehlt)');
  });
});

describe('kistenschildSpalten', () => {
  const zeilen = (n: number) => Array.from({ length: n }, (_, i) => `Zeile ${i + 1}`);

  it('setzt bis 12 Zeilen einspaltig in großer Schrift', () => {
    const { spalten, schrift } = kistenschildSpalten(zeilen(12));
    expect(spalten).toHaveLength(1);
    expect(spalten[0]).toHaveLength(12);
    expect(schrift).toBe(12);
  });

  it('wechselt bis 30 Zeilen auf zwei und bis 57 auf drei Spalten', () => {
    expect(kistenschildSpalten(zeilen(13)).spalten).toHaveLength(2);
    expect(kistenschildSpalten(zeilen(30)).schrift).toBe(10);
    const drei = kistenschildSpalten(zeilen(57));
    expect(drei.spalten).toHaveLength(3);
    expect(drei.schrift).toBe(8);
    expect(drei.spalten.flat()).toHaveLength(57);
  });

  it('kürzt Überlanges mit „… und n weitere“ und behält die Reihenfolge', () => {
    const { spalten } = kistenschildSpalten(zeilen(70));
    const flach = spalten.flat();
    expect(flach).toHaveLength(57);
    expect(flach[0]).toBe('Zeile 1');
    expect(flach.at(-1)).toBe('… und 14 weitere');
  });

  it('liefert für eine leere Kiste eine leere Spalte', () => {
    expect(kistenschildSpalten([]).spalten).toEqual([[]]);
  });

  it('kürzt zu lange Zeilen', () => {
    const { spalten } = kistenschildSpalten(['x'.repeat(200)]);
    expect(spalten[0][0].length).toBeLessThanOrEqual(80);
    expect(spalten[0][0].endsWith('…')).toBe(true);
  });
});

describe('baueKistenschildDefinition', () => {
  it('ist ein A4-Hochformat-Dokument und setzt zwei Schilder auf ein Blatt', () => {
    const kisten: Kiste[] = [
      gewuerz,
      erzeugeTestKiste({ name: 'Zweite' }),
      erzeugeTestKiste({ name: 'Dritte' }),
    ];
    const definition = baueKistenschildDefinition(kisten, daten);
    expect(definition.pageSize).toBe('A4');
    expect(definition.pageOrientation).toBe('portrait');
    const bloecke = seiten(definition);
    expect(bloecke).toHaveLength(2);
    expect(bloecke.map((b) => b.pageBreak)).toEqual([undefined, 'before']);
    expect(alleTexte(bloecke[0])).toEqual(expect.arrayContaining(['Gewürzkiste', 'Zweite']));
    expect(alleTexte(bloecke[0])).not.toContain('Dritte');
    expect(alleTexte(bloecke[1])).toContain('Dritte');
  });

  it('zieht die Schnittlinie nur zwischen zwei Schildern', () => {
    const mitLinie = (kisten: Kiste[]) =>
      JSON.stringify(baueKistenschildDefinition(kisten, daten)).includes('"dash"');
    expect(mitLinie([gewuerz, gewuerz])).toBe(true);
    expect(mitLinie([gewuerz])).toBe(false);
  });

  it('nennt Kistenname, Inhaltszeilen, Gewicht und Heimatlager', () => {
    const texte = alleTexte(seiten(baueKistenschildDefinition([gewuerz], daten)));
    expect(texte).toEqual(
      expect.arrayContaining([
        'Gewürzkiste',
        'Inhalt:',
        '1 Liter Öl (voll)',
        '3× Pfeffer, Dose',
        '2,5 Packung Salz',
        'Gewicht:',
        'Heimatlager',
        'Küchenlager',
      ]),
    );
  });

  it('zeigt „–“ statt des Heimatlagers, wenn es keins gibt', () => {
    const texte = alleTexte(
      seiten(baueKistenschildDefinition([erzeugeTestKiste({ lagerId: null })], daten)),
    );
    expect(texte).toContain('–');
  });

  it('legt das zweite Schild genau eine A5-Höhe tiefer', () => {
    const [seite] = seiten(baueKistenschildDefinition([gewuerz, gewuerz], daten)) as {
      stack: { image?: string; absolutePosition?: { y: number } }[];
    }[];
    const rahmen = seite.stack.filter((k) => k.image?.startsWith('data:image/png'));
    expect(rahmen.map((k) => k.absolutePosition?.y)).toEqual([0, SCHILD.hoehe]);
  });

  it('nutzt nur Farben aus PDF_FARBEN und einen übergebenen Rahmenfarbwert', () => {
    const json = JSON.stringify(
      baueKistenschildDefinition([gewuerz], daten, PDF_FARBEN.abschnitt1),
    );
    const erlaubt = new Set(Object.values(PDF_FARBEN).map((f) => f.toUpperCase()));
    for (const farbe of json.match(/#[0-9a-fA-F]{3,8}/g) ?? []) {
      expect(erlaubt.has(farbe.toUpperCase())).toBe(true);
    }
    expect(json).toContain(PDF_FARBEN.abschnitt1);
    expect(json).not.toContain('var(');
  });

  it('liefert für keine Kiste ein leeres Dokument', () => {
    expect(baueKistenschildDefinition([], daten).content).toEqual([]);
  });
});

describe('baueKistenzettelDefinition', () => {
  const abschnitt = (definition: TDocumentDefinitions) =>
    (definition.content as ContentSection[])[0];

  it('baut je Kiste einen Streifen auf A4 quer mit Überschrift, Lager und Positionen', () => {
    const definition = baueKistenzettelDefinition([gewuerz], daten, 3);
    expect(definition.pageOrientation).toBe('landscape');
    const texte = alleTexte(abschnitt(definition));
    expect(texte).toEqual(
      expect.arrayContaining([
        'Gewürzkiste packen',
        'Küchenlager',
        'Öl (Liter) – voll',
        'Pfeffer, Dose',
        'Salz (Packung)',
        '1×',
        '3×',
        'Erledigt',
        'Bemerkung:',
      ]),
    );
    expect(texte).toContain('2,5×');
  });

  it('lässt „Auf / In“ eine Schreiblinie sein und nennt kein Schild', () => {
    const json = JSON.stringify(baueKistenzettelDefinition([gewuerz], daten, 3));
    const texte = alleTexte(abschnitt(baueKistenzettelDefinition([gewuerz], daten, 3)));
    expect(texte).toContain('AUF / IN');
    expect(texte.join('|')).not.toContain('Schild');
    expect(json).not.toContain('"Kiste"');
  });

  it('nummeriert die Kisten in der übergebenen Reihenfolge', () => {
    const zwei = erzeugeTestKiste({ name: 'Zweite', inhalt: [position('dose', 1)] });
    const texte = alleTexte(abschnitt(baueKistenzettelDefinition([gewuerz, zwei], daten, 3)));
    expect(texte).toEqual(
      expect.arrayContaining([
        'Laufzettel 1 von 2 · Seite 1 von 1',
        'Laufzettel 2 von 2 · Seite 1 von 1',
      ]),
    );
  });

  it('setzt eine zu volle Kiste mit Fortsetzungsstreifen', () => {
    const voll = erzeugeTestKiste({
      name: 'Voll',
      inhalt: Array.from({ length: 30 }, (_, n) => position(`x${n}`, 1)),
    });
    const viele: KistenDruckDaten = {
      artikel: new Map(
        Array.from({ length: 30 }, (_, n) => [
          `x${n}`,
          { name: `A${n}`, einheit: 'Stück' as const },
        ]),
      ),
      lager,
    };
    const texte = alleTexte(abschnitt(baueKistenzettelDefinition([voll], viele, 3)));
    expect(texte).toContain('(Fortsetzung)');
  });

  it('liefert ohne Kisten ein leeres Dokument', () => {
    expect(baueKistenzettelDefinition([], daten, 3).content).toEqual([]);
  });
});
