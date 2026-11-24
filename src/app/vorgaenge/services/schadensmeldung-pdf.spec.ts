import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { testMeldung } from '../testing/vorgang-testdaten';
import {
  KAESTCHEN,
  UNTERSCHRIFT_FELDER,
  bricheUm,
  datumDeutsch,
  fehlendeFelder,
  schadensmeldungFuellen,
  type SchadensmeldungPdfDaten,
} from './schadensmeldung-pdf';

/** Lage und Größe der Felder aus der Anlage 5, Feldnamen wie dort; ohne den echten Formularinhalt. */
const TEXTFELDER: [string, number, number, number, number, boolean][] = [
  ['Datum der Feststellung', 336, 669, 194, 19, false],
  ['Einheit', 336, 648, 194, 19, false],
  ['Bezeichnung  Fahrzeug  Gerätesatz Kennzeichen Fahrzeug', 336, 628, 194, 19, false],
  ['Bezeichnung  Fahrzeug  Gerätesatz Kennzeichen Fahrzeug_2', 336, 608, 194, 19, false],
  ['Ort Datum Uhrzeit der Beschädigung des Verlustes falls bekannt', 336, 577, 193, 29, true],
  ['Darstellung', 65, 462, 465, 77, true],
  ['Stellungnahme eines Verantwortlichen', 65, 373, 465, 64, true],
  ['Verfahrensweise', 65, 282, 465, 64, true],
  ['Name', 181, 240, 121, 17, false],
  ['Datum', 320, 240, 83, 17, false],
  ['Name_2', 181, 195, 121, 17, false],
  ['Datum_2', 320, 195, 83, 17, false],
  ['Name_3', 181, 149, 121, 17, false],
  ['Datum_3', 320, 149, 83, 17, false],
];

async function vorlage(ohne: string[] = []): Promise<ArrayBuffer> {
  const dokument = await PDFDocument.create();
  const seite = dokument.addPage([595.56, 842.04]);
  const formular = dokument.getForm();
  for (const [name, x, y, width, height, mehrzeilig] of TEXTFELDER) {
    if (ohne.includes(name)) continue;
    const feld = formular.createTextField(name);
    if (mehrzeilig) feld.enableMultiline();
    feld.addToPage(seite, { x, y, width, height });
  }
  formular
    .createCheckBox(KAESTCHEN.schaden)
    .addToPage(seite, { x: 86, y: 703, width: 18, height: 18 });
  formular
    .createCheckBox(KAESTCHEN.verlust)
    .addToPage(seite, { x: 317, y: 703, width: 18, height: 18 });
  const bytes = await dokument.save();
  return bytes.slice().buffer;
}

const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

function daten(
  ueberschreibung: Partial<SchadensmeldungPdfDaten> = {},
  meldung = {},
): SchadensmeldungPdfDaten {
  return {
    inhalt: testMeldung(meldung),
    unterschriften: [
      {
        slot: 'fest',
        name: 'Tim Beispiel',
        datum: '2026-11-12T10:00:00.000Z',
        signatur: { art: 'schrift', text: 'Tim Beispiel', font: 'Caveat' },
      },
      {
        slot: 'verantw',
        name: 'Zora Muster',
        datum: '2026-11-13T08:00:00.000Z',
        signatur: {
          art: 'zeichnung',
          striche: [
            [
              [10, 20],
              [200, 90],
              [400, 30],
            ],
          ],
        },
      },
    ],
    ...ueberschreibung,
  };
}

const schriftBild = vi.fn(async () => PNG_1X1);

async function lies(bytes: Uint8Array) {
  const dokument = await PDFDocument.load(bytes);
  return { dokument, formular: dokument.getForm() };
}

describe('fehlendeFelder', () => {
  it('erkennt eine passende Vorlage', async () => {
    expect(await fehlendeFelder(await vorlage())).toEqual([]);
  });

  it('nennt fehlende Felder', async () => {
    expect(await fehlendeFelder(await vorlage(['Einheit', 'Name_3']))).toEqual([
      'Einheit',
      'Name_3',
    ]);
  });

  it('lehnt eine Datei ab, die kein PDF ist', async () => {
    await expect(
      fehlendeFelder(new TextEncoder().encode('kein pdf').buffer as ArrayBuffer),
    ).rejects.toThrow('kein lesbares PDF');
  });
});

describe('schadensmeldungFuellen', () => {
  it('füllt Angaben, Daten und das Kästchen der Art', async () => {
    const bytes = await schadensmeldungFuellen(await vorlage(), daten(), {
      flach: false,
      schriftBild,
    });
    const { formular } = await lies(bytes);
    expect(formular.getTextField('Datum der Feststellung').getText()).toBe('12.11.2026');
    expect(formular.getTextField('Einheit').getText()).toBe('BI EE 04');
    expect(
      formular.getTextField('Bezeichnung  Fahrzeug  Gerätesatz Kennzeichen Fahrzeug').getText(),
    ).toBe('GW SAN');
    expect(formular.getTextField('Darstellung').getText()).toBe(
      'Das Stromaggregat springt nicht an.',
    );
    expect(formular.getTextField(UNTERSCHRIFT_FELDER.fest.name).getText()).toBe('Tim Beispiel');
    expect(formular.getTextField(UNTERSCHRIFT_FELDER.fest.datum).getText()).toBe('12.11.2026');
    expect(formular.getTextField(UNTERSCHRIFT_FELDER.verantw.datum).getText()).toBe('13.11.2026');
    expect(formular.getTextField(UNTERSCHRIFT_FELDER.leitung.name).getText() ?? '').toBe('');
    expect(formular.getCheckBox(KAESTCHEN.schaden).isChecked()).toBe(true);
    expect(formular.getCheckBox(KAESTCHEN.verlust).isChecked()).toBe(false);
  });

  it('kreuzt bei einer Verlustmeldung das andere Kästchen an', async () => {
    const bytes = await schadensmeldungFuellen(await vorlage(), daten({}, { art: 'verlust' }), {
      flach: false,
      schriftBild,
    });
    const { formular } = await lies(bytes);
    expect(formular.getCheckBox(KAESTCHEN.verlust).isChecked()).toBe(true);
    expect(formular.getCheckBox(KAESTCHEN.schaden).isChecked()).toBe(false);
  });

  it('verwandelt die Felder standardmäßig in festen Inhalt', async () => {
    const bytes = await schadensmeldungFuellen(await vorlage(), daten(), { schriftBild });
    const { formular, dokument } = await lies(bytes);
    expect(formular.getFields()).toHaveLength(0);
    expect(dokument.getPageCount()).toBe(1);
  });

  it('hängt für einen langen Sachverhalt ein Beiblatt an und verweist im Feld darauf', async () => {
    const lang = 'Das Aggregat zeigt seit Wochen Aussetzer im Betrieb. '.repeat(40);
    const bytes = await schadensmeldungFuellen(
      await vorlage(),
      daten({}, { sachverhalt: lang.slice(0, 2300) }),
      {
        flach: false,
        schriftBild,
      },
    );
    const { formular, dokument } = await lies(bytes);
    expect(dokument.getPageCount()).toBe(2);
    expect(formular.getTextField('Darstellung').getText()).toBe('Siehe Beiblatt (Seite 2).');
  });

  it('kommt bei einem kurzen Sachverhalt ohne Beiblatt aus', async () => {
    const bytes = await schadensmeldungFuellen(
      await vorlage(),
      daten({}, { sachverhalt: 'Kurz.' }),
      {
        flach: false,
        schriftBild,
      },
    );
    expect((await lies(bytes)).dokument.getPageCount()).toBe(1);
  });

  it('verkleinert die Schrift, statt sofort ein Beiblatt anzulegen', async () => {
    // Etwa 520 Zeichen passen in 11 pt nicht, in 9 pt schon.
    const text = 'Aggregat defekt und nicht startbar. '.repeat(14).slice(0, 520);
    const bytes = await schadensmeldungFuellen(await vorlage(), daten({}, { sachverhalt: text }), {
      flach: false,
      schriftBild,
    });
    const { dokument, formular } = await lies(bytes);
    expect(dokument.getPageCount()).toBe(1);
    expect(formular.getTextField('Darstellung').getText()).toBe(text);
  });

  it('ersetzt Zeichen, die die Standardschrift nicht kennt', async () => {
    const bytes = await schadensmeldungFuellen(await vorlage(), daten({}, { ort: 'Halle 😀 Ü' }), {
      flach: false,
      schriftBild,
    });
    const { formular } = await lies(bytes);
    expect(
      formular
        .getTextField('Ort Datum Uhrzeit der Beschädigung des Verlustes falls bekannt')
        .getText(),
    ).toBe('Halle ? Ü');
  });

  it('fordert für eine Schriftunterschrift das Bild an und kommt auch ohne Bild aus', async () => {
    const erzeuger = vi.fn(async () => PNG_1X1);
    await schadensmeldungFuellen(await vorlage(), daten(), { schriftBild: erzeuger });
    expect(erzeuger).toHaveBeenCalledWith('Tim Beispiel', 'Caveat');

    const ohneBild = await schadensmeldungFuellen(await vorlage(), daten(), {
      schriftBild: async () => null,
    });
    expect((await lies(ohneBild)).dokument.getPageCount()).toBe(1);
  });

  it('bricht ab, wenn die Vorlage nicht zum Formular passt', async () => {
    await expect(
      schadensmeldungFuellen(await vorlage(['Einheit']), daten(), { schriftBild }),
    ).rejects.toThrow(/Einheit/);
  });
});

describe('Hilfsfunktionen', () => {
  it('formatiert Datum', () => {
    expect(datumDeutsch('2026-11-12')).toBe('12.11.2026');
    expect(datumDeutsch('2026-11-12T10:00:00.000Z')).toBe('12.11.2026');
    expect(datumDeutsch('')).toBe('');
  });

  it('bricht Text um und trennt zu lange Wörter', async () => {
    const dokument = await PDFDocument.create();
    const { StandardFonts } = await import('pdf-lib');
    const schrift = await dokument.embedFont(StandardFonts.Helvetica);
    const zeilen = bricheUm('Das ist ein Text\nzweite Zeile', schrift, 11, 60);
    expect(zeilen.length).toBeGreaterThan(2);
    expect(zeilen.join(' ')).toContain('zweite');
    const lang = bricheUm('x'.repeat(200), schrift, 11, 100);
    expect(lang.every((z) => schrift.widthOfTextAtSize(z, 11) <= 100)).toBe(true);
  });
});
