import type { ContentSection, TDocumentDefinitions } from 'pdfmake/interfaces';
import { describe, expect, it } from 'vitest';
import { PDF_FARBEN } from '../../kern/pdf/pdf-bibliothek';
import { testAbschnitt, testInhalt, testLaufzettel, testPosition } from '../testing/vb-testdaten';
import { baueLaufzettelStreifen } from './laufzettel-layout';
import {
  baueVbPdfDefinition,
  formatiereZeitraum,
  schildTitelSchrift,
  VbDruckKopf,
} from './vb-pdf-definition';

const KOPF: VbDruckKopf = {
  titel: 'Weihnachtsmarkt Ummeln',
  beginn: '2026-12-05T10:00',
  ende: '2026-12-05T20:00',
  ort: 'Ummeln',
};
const JETZT = new Date(2026, 10, 4, 12, 30);

/** Die bisherigen Fälle gelten für drei Streifen je Seite; andere Zahlen nennen die Tests selbst. */
function definition(inhalt = testInhalt(), kopf = KOPF, streifenJeSeite = 3): TDocumentDefinitions {
  return baueVbPdfDefinition(
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

describe('Kennzeichnungsschild', () => {
  it('legt je Abschnitt eine eigene A4-Querseite an', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({ titel: 'Sanitätszelt', laufzettel: [] }),
        testAbschnitt({ titel: 'Verpflegung', laufzettel: [] }),
      ],
    });
    const def = definition(inhalt);
    const schilder = abschnitte(def).find((a) => alleTexte(a).includes('Sanitätszelt'));
    expect(schilder?.pageOrientation).toBe('landscape');
    const seiten = schilder?.section as { pageBreak?: string }[];
    expect(seiten).toHaveLength(2);
    expect(seiten.map((s) => s.pageBreak)).toEqual([undefined, 'before']);
    expect(alleTexte(schilder)).toContain('ABSCHNITT 2 VON 2');
  });

  it('verkleinert die Schrift bei langen Titeln', () => {
    expect(schildTitelSchrift('Kurz')).toBeGreaterThan(schildTitelSchrift('x'.repeat(40)));
    expect(schildTitelSchrift('x'.repeat(40))).toBeGreaterThan(schildTitelSchrift('x'.repeat(200)));
  });
});

describe('baueVbPdfDefinition', () => {
  it('ist ein A4-Querformat-Dokument', () => {
    const def = definition();
    expect(def.pageSize).toBe('A4');
    expect(def.pageOrientation).toBe('landscape');
    for (const a of abschnitte(def)) expect(a.pageOrientation).toBe('landscape');
  });

  it('setzt die Seite „Allgemeine Anweisungen“ nur bei vorhandenem Text', () => {
    const mit = definition(testInhalt({ anweisungen: 'Treffpunkt 8 Uhr' }));
    expect(abschnitte(mit)).toHaveLength(3); // Anweisungen, Laufzettel, Schilder
    const texte = alleTexte(abschnitte(mit)[0]);
    expect(texte).toContain('Vorbereitung · Allgemeine Anweisungen');
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
    expect(texte).toContain('Nr. 1/7 · S. 1/2');
    expect(texte).not.toContain('Laufzettel 1 von 7 · Seite 1 von 2');
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
    expect(texte).toContain('Laufzettel 1 von 2 · Seite 1 von 1');
    expect(texte).toContain('Laufzettel 2 von 2 · Seite 1 von 1');
    expect(texte).toContain('Zweiter');
    expect(texte).toContain('AUFTRAG');
    expect(texte).toContain('Betreuung');
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
          laufzettel: [testLaufzettel(), testLaufzettel({ fachgruppe: 'tesi' })],
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
    // Abschnittsfarben und Fachgruppenfarbe kommen aus der zentralen Quelle
    expect(json).toContain(PDF_FARBEN.abschnitt5);
    expect(json).toContain(PDF_FARBEN.katTesi);
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
