import type { ContentSection, TDocumentDefinitions } from 'pdfmake/interfaces';
import { describe, expect, it } from 'vitest';
import { PDF_FARBEN } from '../../kern/pdf/pdf-bibliothek';
import {
  testAbschnitt,
  testInhalt,
  testLaufzettel,
  testPosition,
} from '../testing/druck-testdaten';
import { baueLaufzettelStreifen } from './laufzettel-layout';
import { laufzettelNummern } from './laufzettel-platz';
import {
  baueZettelPdfDefinition,
  formatiereZeitraum,
  SCHILD,
  schildInhaltZeilen,
  schildTitelSchrift,
  DruckKopf,
} from './zettel-pdf-definition';

const KOPF: DruckKopf = {
  titel: 'Weihnachtsmarkt Ummeln',
  beginn: '2026-12-05T10:00',
  ende: '2026-12-05T20:00',
  ort: 'Ummeln',
};
const JETZT = new Date(2026, 10, 4, 12, 30);

/** Die bisherigen Fälle gelten für drei Streifen je Seite; andere Zahlen nennen die Tests selbst. */
function definition(inhalt = testInhalt(), kopf = KOPF, streifenJeSeite = 3): TDocumentDefinitions {
  return baueZettelPdfDefinition(
    kopf,
    inhalt,
    baueLaufzettelStreifen(inhalt, streifenJeSeite),
    JETZT,
    streifenJeSeite,
  );
}

function abschnitte(def: TDocumentDefinitions): ContentSection[] {
  return def.content as ContentSection[];
}

/** Alle Textbausteine eines Knotenbaums, in Dokumentreihenfolge. */
function alleTexte(knoten: unknown, ergebnis: string[] = []): string[] {
  if (typeof knoten === 'string') ergebnis.push(knoten);
  else if (Array.isArray(knoten)) knoten.forEach((k) => alleTexte(k, ergebnis));
  else if (knoten && typeof knoten === 'object') {
    for (const [schluessel, wert] of Object.entries(knoten)) {
      if (['text', 'stack', 'columns', 'table', 'body', 'section', 'footer'].includes(schluessel)) {
        alleTexte(wert, ergebnis);
      }
    }
  }
  return ergebnis;
}

function laufzettelSeiten(def: TDocumentDefinitions): unknown[] {
  const abschnitt = abschnitte(def).find((a) => a.pageMargins?.toString() === '0,0,0,0');
  return (abschnitt?.section as unknown[]) ?? [];
}

function inhaltMitLaufzetteln(anzahl: number) {
  return testInhalt({
    abschnitte: [
      testAbschnitt({ laufzettel: Array.from({ length: anzahl }, () => testLaufzettel()) }),
    ],
  });
}

describe('Harter Zeichenumbruch', () => {
  it('bricht zu lange Wörter in Material, Lagerort und Rückfragen hart um', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({
          laufzettel: [
            testLaufzettel({
              lagerort: 'Betreuungsanhänger',
              auftraggeber: 'Verpflegungsgruppenführung',
              positionen: [testPosition({ material: 'Rechteckpfanneneinsatz' })],
            }),
          ],
        }),
      ],
    });
    const json = JSON.stringify(definition(inhalt, KOPF, 6));
    for (const wort of ['Rechteckpfanneneinsatz', 'Betreuungsanhänger']) {
      expect(json).not.toContain(wort);
      expect(json).toContain([...wort].join('\u200b'));
    }
  });
});

describe('Hinweis auf dem Laufzettel', () => {
  it('druckt einen Hinweis ohne Kästchen und Anzahl über zwei Spalten', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({
          laufzettel: [
            testLaufzettel({
              positionen: [
                testPosition({ material: 'Vorsicht, schwer', anzahl: '', hinweis: true }),
              ],
            }),
          ],
        }),
      ],
    });
    const json = JSON.stringify(definition(inhalt));
    expect(json).toContain('"text":"Vorsicht, schwer"');
    expect(json).toContain('"colSpan":2');
  });
});

function schildAbschnitt(def: TDocumentDefinitions): ContentSection | undefined {
  return abschnitte(def).find((a) => a.pageOrientation === 'portrait');
}

describe('Verladungsfoto', () => {
  it('steht im Schild neben der Inhaltsliste, nie auf einer zweiten Seite', () => {
    const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({ titel: 'Sanitätszelt', foto, laufzettel: [] }),
        testAbschnitt({ titel: 'Verpflegung', laufzettel: [] }),
      ],
    });
    const schilder = schildAbschnitt(definition(inhalt));
    const seiten = schilder?.section as { pageBreak?: string }[];
    expect(seiten).toHaveLength(1);
    const text = JSON.stringify(seiten[0]);
    expect(text.split(foto)).toHaveLength(2);
    expect(text).toContain('Sanitätszelt');
  });
});

describe('Abschnittsschild', () => {
  const zwei = [
    testAbschnitt({ titel: 'Sanitätszelt', laufzettel: [] }),
    testAbschnitt({ titel: 'Verpflegung', laufzettel: [] }),
    testAbschnitt({ titel: 'Funk', laufzettel: [] }),
  ];

  it('setzt zwei A5-Schilder auf ein A4-Hochformatblatt', () => {
    const schilder = schildAbschnitt(definition(testInhalt({ abschnitte: zwei })));
    expect(schilder?.pageSize).toBe('A4');
    const seiten = schilder?.section as { pageBreak?: string }[];
    expect(seiten).toHaveLength(2);
    expect(seiten.map((s) => s.pageBreak)).toEqual([undefined, 'before']);
    const ersteSeite = alleTexte(seiten[0]);
    expect(ersteSeite).toContain('Sanitätszelt');
    expect(ersteSeite).toContain('Verpflegung');
    expect(ersteSeite).not.toContain('Funk');
    expect(alleTexte(seiten[1])).toContain('Funk');
  });

  it('nennt oben das Ziel und unten den Einsatz mit Zeitraum', () => {
    const schilder = schildAbschnitt(definition(testInhalt({ abschnitte: [zwei[0]] })));
    const texte = alleTexte(schilder);
    expect(texte).toContain('Sanitätszelt');
    expect(texte).toContain('Weihnachtsmarkt Ummeln');
    expect(texte).toContain('Sa., 05.12.2026, 10:00 – 20:00 Uhr');
    expect(texte.join('|')).not.toContain('Abschnitt 1 von');
  });

  it('legt das zweite Schild genau eine A5-Höhe tiefer', () => {
    const seiten = schildAbschnitt(definition(testInhalt({ abschnitte: zwei })))?.section as {
      stack: { absolutePosition?: { y: number } }[];
    }[];
    const rahmen = seiten[0].stack.filter(
      (k) => (k as { image?: string }).image?.startsWith('data:image/png') === true,
    );
    expect(rahmen.map((k) => k.absolutePosition?.y)).toEqual([0, SCHILD.hoehe]);
    expect(SCHILD.hoehe * 2).toBeCloseTo(841.89, 0);
  });

  it('nennt je Laufzettel Nummer, Überschrift und Lager und kürzt, was nicht passt', () => {
    const laufzettel = Array.from({ length: 40 }, (_, i) =>
      testLaufzettel({ ueberschrift: `Laufzettel Nummer ${i + 1}`, lagerort: 'Lager Nord' }),
    );
    const abschnitt = testAbschnitt({ laufzettel });
    const nummern = laufzettelNummern(testInhalt({ abschnitte: [abschnitt] }));
    const { spalten, schrift } = schildInhaltZeilen(abschnitt, nummern);
    const zeilen = spalten.flat();
    expect(spalten).toHaveLength(2);
    expect(zeilen).toHaveLength(28);
    expect(zeilen.at(-1)).toBe('… und 13 weitere');
    expect(schrift).toBe(9);
    const kurz = testAbschnitt({ laufzettel: laufzettel.slice(0, 2) });
    const wenige = schildInhaltZeilen(kurz, laufzettelNummern(testInhalt({ abschnitte: [kurz] })));
    expect(wenige.spalten).toEqual([
      ['Nr 1 · Laufzettel Nummer 1 · Lager Nord', 'Nr 2 · Laufzettel Nummer 2 · Lager Nord'],
    ]);
  });

  it('lässt „· Lager“ weg, wenn ein Laufzettel keines hat', () => {
    const abschnitt = testAbschnitt({
      laufzettel: [testLaufzettel({ ueberschrift: 'Pavillon', lagerort: ' ' })],
    });
    const { spalten } = schildInhaltZeilen(
      abschnitt,
      laufzettelNummern(testInhalt({ abschnitte: [abschnitt] })),
    );
    expect(spalten).toEqual([['Nr 1 · Pavillon']]);
  });

  it('verkleinert die Schrift bei langen Titeln', () => {
    expect(schildTitelSchrift('Kurz')).toBeGreaterThan(schildTitelSchrift('x'.repeat(40)));
    expect(schildTitelSchrift('x'.repeat(40))).toBeGreaterThan(schildTitelSchrift('x'.repeat(200)));
  });
});

describe('baueZettelPdfDefinition', () => {
  it('ist ein A4-Querformat-Dokument, nur die Abschnittsschilder stehen hoch', () => {
    const def = definition();
    expect(def.pageSize).toBe('A4');
    expect(def.pageOrientation).toBe('landscape');
    for (const a of abschnitte(def).filter((x) => x !== schildAbschnitt(def))) {
      expect(a.pageOrientation).toBe('landscape');
    }
  });

  it('setzt die Seite „Allgemeine Anweisungen“ nur bei vorhandenem Text', () => {
    const mit = definition(testInhalt({ anweisungen: 'Treffpunkt 8 Uhr' }));
    expect(abschnitte(mit)).toHaveLength(3); // Anweisungen, Laufzettel, Schilder
    const texte = alleTexte(abschnitte(mit)[0]);
    expect(texte).toContain('Aufbau · Allgemeine Anweisungen');
    expect(texte).toContain('Treffpunkt 8 Uhr');
    expect(texte).toContain('Weihnachtsmarkt Ummeln');
    expect(
      texte.some((t) => t.includes('1 Laufzettel in 1 Abschnitten · gedruckt am 04.11.2026')),
    ).toBe(true);

    const ohne = definition(testInhalt({ anweisungen: '  \n ' }));
    expect(abschnitte(ohne)).toHaveLength(2); // Laufzettel, Schilder
    expect(alleTexte(abschnitte(ohne)).join('|')).not.toContain('Allgemeine Anweisungen');
  });

  it('führt den Freitext in zwei fließenden Spalten', () => {
    const [anweisungen] = abschnitte(definition());
    const spalten = (
      anweisungen.section as { snakingColumns?: boolean; columns?: unknown[] }[]
    ).find((k) => k.snakingColumns);
    expect(spalten?.columns).toHaveLength(2);
  });

  it('legt je drei Streifen eine Seite an und bricht ab der zweiten Seite um', () => {
    const seiten = laufzettelSeiten(definition(inhaltMitLaufzetteln(7)));
    expect(seiten).toHaveLength(3);
    expect(seiten.map((s) => (s as { pageBreak?: string }).pageBreak)).toEqual([
      undefined,
      'before',
      'before',
    ]);
    // 6 Laufzettel passen genau auf zwei Seiten
    expect(laufzettelSeiten(definition(inhaltMitLaufzetteln(6)))).toHaveLength(2);
  });

  it('legt bei sechs Streifen je Seite sechs schmale Spalten an und kürzt den Seitenfuß', () => {
    const inhalt = inhaltMitLaufzetteln(7);
    const seiten = laufzettelSeiten(definition(inhalt, KOPF, 6));
    expect(seiten).toHaveLength(2);
    const spalten = (seiten[0] as { stack: { columns?: { width: number }[] }[] }).stack[1].columns;
    expect(spalten).toHaveLength(6);
    for (const spalte of spalten ?? []) expect(spalte.width).toBeCloseTo(841.89 / 6, 1);
    // die letzte Seite wird mit leeren Spalten auf sechs aufgefüllt
    const letzte = (seiten[1] as { stack: { columns?: unknown[] }[] }).stack[1].columns;
    expect(letzte).toHaveLength(6);
    const texte = alleTexte(seiten);
    expect(texte).toContain('Nr. 1/7 · Schild 1 · S. 1/2');
    expect(texte).not.toContain('Laufzettel 1 von 7 · Schild 1 von 1 · Seite 1 von 2');
  });

  it('setzt die Nummern der Laufzettel bei den Packzetteln fort', () => {
    const basis = inhaltMitLaufzetteln(2);
    const packzettel = inhaltMitLaufzetteln(2).abschnitte.map((a, i) => ({
      ...a,
      id: `pack-${i}`,
      laufzettel: a.laufzettel.map((l) => ({
        ...l,
        id: `pack-${l.id}`,
        ueberschrift: 'Kiste packen',
      })),
    }));
    const inhalt = { ...basis, kistenzettel: packzettel };
    const def = definition(inhalt);
    const alle = abschnitte(def).filter((a) => a.pageMargins?.toString() === '0,0,0,0');
    const texte = (i: number) => alleTexte(alle[i]!.section);
    // Laufzettel 1 und 2 von insgesamt 4, Packzettel 3 und 4 von 4 (Fuß bei drei Streifen je Seite).
    expect(texte(0)).toEqual(
      expect.arrayContaining([expect.stringContaining('Laufzettel 1 von 4')]),
    );
    expect(texte(0)).toEqual(
      expect.arrayContaining([expect.stringContaining('Laufzettel 2 von 4')]),
    );
    expect(texte(1)).toEqual(
      expect.arrayContaining([expect.stringContaining('Laufzettel 3 von 4')]),
    );
    expect(texte(1)).toEqual(
      expect.arrayContaining([expect.stringContaining('Laufzettel 4 von 4')]),
    );
    expect(texte(1).join('|')).not.toContain('Laufzettel 1 von');
  });

  it('erzeugt ohne Laufzettel keinen Laufzettelabschnitt', () => {
    const def = definition(testInhalt({ abschnitte: [] }));
    expect(abschnitte(def)).toHaveLength(1);
  });

  it('beschriftet Nummer, Fortsetzung und Seitenfuß', () => {
    const positionen = Array.from({ length: 30 }, (_, i) =>
      testPosition({ material: `Teil ${i}` }),
    );
    const inhalt = testInhalt({
      anweisungen: '',
      abschnitte: [
        testAbschnitt({
          laufzettel: [testLaufzettel({ positionen }), testLaufzettel({ ueberschrift: 'Zweiter' })],
        }),
      ],
    });
    const texte = alleTexte(laufzettelSeiten(definition(inhalt)));
    expect(texte.filter((t) => t === '(Fortsetzung)')).toHaveLength(1);
    expect(texte).toContain('Laufzettel 1 von 2 · Schild 1 von 1 · Seite 1 von 1');
    expect(texte).toContain('Laufzettel 2 von 2 · Schild 1 von 1 · Seite 1 von 1');
    expect(texte).toContain('Zweiter');
    expect(texte).toContain('AUFTRAG');
    expect(texte).not.toContain('Betreuung');
  });

  it('zeigt die Abschnittsfarbe nur als Farbband und keine Fachgruppe', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({ farbe: 'abschnitt-5', fachgruppe: 'tesi', laufzettel: [testLaufzettel()] }),
      ],
    });
    const seiten = laufzettelSeiten(definition(inhalt));
    const json = JSON.stringify(seiten);
    // genau ein Farbhinweis je Streifen: das Farbband, weder Balken noch Punkt
    expect(json.split(PDF_FARBEN.abschnitt5)).toHaveLength(2);
    expect(json).not.toContain(PDF_FARBEN.katTesi);
    expect(alleTexte(seiten)).not.toContain('TeSi');
    const schild = JSON.stringify(schildAbschnitt(definition(inhalt)));
    expect(schild).not.toContain('TeSi');
    expect(schild).not.toContain(PDF_FARBEN.katTesi);
  });

  it('rahmt das Foto in der Abschnittsfarbe, auch leer ohne Foto', () => {
    const mit = testInhalt({
      abschnitte: [
        testAbschnitt({ farbe: 'abschnitt-5', foto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }),
      ],
    });
    const ohne = testInhalt({ abschnitte: [testAbschnitt({ farbe: 'abschnitt-5' })] });
    for (const inhalt of [mit, ohne]) {
      const json = JSON.stringify(schildAbschnitt(definition(inhalt)));
      expect(json).toContain(`"lineColor":"${PDF_FARBEN.abschnitt5}"`);
    }
    expect(JSON.stringify(schildAbschnitt(definition(ohne)))).not.toContain(
      '"image":"data:image/jpeg',
    );
  });

  it('zieht zwischen zwei Schildern eine Schnittlinie, bei einem einzelnen nicht', () => {
    const zweiSchilder = testInhalt({ abschnitte: [testAbschnitt(), testAbschnitt()] });
    const einSchild = testInhalt({ abschnitte: [testAbschnitt()] });
    const mitLinie = (inhalt: ReturnType<typeof testInhalt>) =>
      JSON.stringify(schildAbschnitt(definition(inhalt))).includes('"dash"');
    expect(mitLinie(zweiSchilder)).toBe(true);
    expect(mitLinie(einSchild)).toBe(false);
  });

  it('hat genau einen Haken „Erledigt“ und kein „nicht möglich“', () => {
    const texte = alleTexte(laufzettelSeiten(definition()));
    expect(texte.filter((t) => t === 'Erledigt')).toHaveLength(1);
    expect(texte.join('|')).not.toContain('nicht möglich');
    expect(texte).toContain('Bemerkung:');
  });

  it('druckt den Abschnitt als „Auf / In“, wenn „Transport mit“ leer ist', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({
          titel: 'Rollwagen 01',
          laufzettel: [testLaufzettel({ transportMit: '' })],
        }),
      ],
    });
    const texte = alleTexte(laufzettelSeiten(definition(inhalt)));
    expect(texte).toContain('Rollwagen 01');
  });

  it('zeigt Anzahl mit „×“ und leere Anzahl als „__“, mit festem Raster aus 23 Zeilen', () => {
    const inhalt = testInhalt({
      anweisungen: '',
      abschnitte: [
        testAbschnitt({
          laufzettel: [
            testLaufzettel({
              positionen: [testPosition({ anzahl: '12' }), testPosition({ anzahl: '' })],
            }),
          ],
        }),
      ],
    });
    const seiten = laufzettelSeiten(definition(inhalt));
    const texte = alleTexte(seiten);
    expect(texte).toContain('12×');
    expect(texte).toContain('__');
    const tabellen: { table: { body: unknown[][] } }[] = [];
    const sammle = (k: unknown): void => {
      if (Array.isArray(k)) k.forEach(sammle);
      else if (k && typeof k === 'object') {
        const o = k as Record<string, unknown>;
        if (o['table'] && (o['table'] as { widths?: unknown[] }).widths?.length === 3) {
          tabellen.push(o as { table: { body: unknown[][] } });
        }
        Object.values(o).forEach(sammle);
      }
    };
    sammle(seiten);
    expect(tabellen).toHaveLength(1);
    expect(tabellen[0].table.body).toHaveLength(23);
  });

  it('enthält keine CSS-Variablen und nur Farben aus PDF_FARBEN', () => {
    const inhalt = testInhalt({
      abschnitte: (['abschnitt-1', 'abschnitt-5', 'abschnitt-8'] as const).map((farbe) =>
        testAbschnitt({
          farbe,
          laufzettel: [testLaufzettel(), testLaufzettel()],
        }),
      ),
    });
    const json = JSON.stringify(definition(inhalt));
    expect(json).not.toContain('var(');
    expect(json).not.toContain('--');
    const erlaubt = new Set(Object.values(PDF_FARBEN).map((f) => f.toUpperCase()));
    const verwendet = json.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    expect(verwendet.length).toBeGreaterThan(0);
    for (const farbe of verwendet) expect(erlaubt.has(farbe.toUpperCase())).toBe(true);
    // Abschnittsfarben kommen aus der zentralen Quelle
    expect(json).toContain(PDF_FARBEN.abschnitt5);
  });
});

describe('formatiereZeitraum', () => {
  it('fasst einen Tag zusammen und schreibt mehrtägige Zeiträume aus', () => {
    expect(formatiereZeitraum('2026-12-05T10:00', '2026-12-05T20:00')).toBe(
      'Sa., 05.12.2026, 10:00 – 20:00 Uhr',
    );
    expect(formatiereZeitraum('2026-12-05T10:00', '2026-12-06T18:30')).toBe(
      'Sa., 05.12.2026, 10:00 – So., 06.12.2026, 18:30 Uhr',
    );
  });

  it('rechnet nicht über UTC und behandelt fehlende Werte', () => {
    expect(formatiereZeitraum('2026-12-31T23:30', null)).toBe('Do., 31.12.2026, 23:30 Uhr');
    expect(formatiereZeitraum('2026-03-29T01:30', '2026-03-29T03:30')).toBe(
      'So., 29.03.2026, 01:30 – 03:30 Uhr',
    );
    expect(formatiereZeitraum(null, null)).toBe('');
    expect(formatiereZeitraum('kaputt', null)).toBe('');
  });
});
