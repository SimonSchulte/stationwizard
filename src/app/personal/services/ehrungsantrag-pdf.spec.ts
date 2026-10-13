import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  ANTRAG_KAESTCHEN,
  VERLIEHEN_AM_FELD,
  ehrungsantragFuellen,
  fehlendeFelder,
  type EhrungsantragDaten,
} from './ehrungsantrag-pdf';

const TEXTFELDER = [
  'über den Landesverband einzureichen',
  'LV',
  'RVKV',
  'Straße',
  'Wohnort',
  'Geburtsdatum',
  'Mitglied seit',
  'Tätigkeit',
  'Dienststunden',
  'Text1',
  ...Object.values(VERLIEHEN_AM_FELD),
];
const KAESTCHEN = ['Frau', 'Herr', ...Object.values(ANTRAG_KAESTCHEN)];

/** Nachbildung der Formularstruktur mit denselben Feldnamen, ohne den echten Formularinhalt. */
async function vorlage(ohne: string[] = []): Promise<ArrayBuffer> {
  const dokument = await PDFDocument.create();
  const seite = dokument.addPage([595, 842]);
  const formular = dokument.getForm();
  let y = 800;
  for (const name of TEXTFELDER.filter((n) => !ohne.includes(n))) {
    formular.createTextField(name).addToPage(seite, { x: 40, y, width: 200, height: 10 });
    y -= 12;
  }
  for (const name of KAESTCHEN.filter((n) => !ohne.includes(n))) {
    formular.createCheckBox(name).addToPage(seite, { x: 300, y, width: 8, height: 8 });
    y -= 12;
  }
  if (!ohne.includes('Text1')) formular.getTextField('Text1').enableMultiline();
  const bytes = await dokument.save();
  return bytes.slice().buffer;
}

function daten(ueberschreibung: Partial<EhrungsantragDaten> = {}): EhrungsantragDaten {
  return {
    person: {
      nachname: 'Muster',
      vorname: 'Jürgen',
      stunden: 2150,
      eintrittsdatum: '1998-04-01',
      erhalten: { bronze: 2015, 'jubilaeum-25': null },
    },
    auszeichnung: 'silber',
    landesverband: 'Testland',
    regionalverband: 'Testregion',
    taetigkeit: 'Sanitätshelfer',
    begruendung: '  Besonderer Einsatz  ',
    anrede: 'Herren',
    ...ueberschreibung,
  };
}

async function lesen(pdf: Uint8Array) {
  return (await PDFDocument.load(pdf)).getForm();
}

describe('ehrungsantragFuellen', () => {
  it('trägt Personen-, Organisations- und Antragsangaben ein und lässt alles ausfüllbar', async () => {
    const formular = await lesen(await ehrungsantragFuellen(await vorlage(), daten()));
    const text = (name: string) => formular.getTextField(name).getText() ?? '';
    expect(text('über den Landesverband einzureichen')).toBe('Muster, Jürgen');
    expect(text('LV')).toBe('Testland');
    expect(text('RVKV')).toBe('Testregion');
    expect(text('Mitglied seit')).toBe('01.04.1998');
    expect(text('Tätigkeit')).toBe('Sanitätshelfer');
    expect(text('Dienststunden')).toBe('2.150');
    expect(text('Text1')).toBe('Besonderer Einsatz');
    // Bereits Erhaltenes mit Jahr bzw. ohne bekanntes Jahr.
    expect(text('Bronze_2')).toBe('2015');
    expect(text('25 Jahre')).toBe('erhalten');
    expect(text('Gold_2')).toBe('');
    // Anschrift und Geburtsdatum bleiben leer, aber vorhanden und beschreibbar.
    expect(text('Straße')).toBe('');
    expect(text('Geburtsdatum')).toBe('');
    expect(formular.getTextField('Straße').isReadOnly()).toBe(false);
    // Genau die beantragte Auszeichnung ist angekreuzt.
    const angekreuzt = KAESTCHEN.filter((name) => formular.getCheckBox(name).isChecked());
    expect(angekreuzt).toEqual(['Herr', 'Leistungsabzeichen_2']);
  });

  it('lässt Frau/Herr ohne eindeutige Anrede und ein fehlendes Eintrittsdatum leer', async () => {
    const formular = await lesen(
      await ehrungsantragFuellen(
        await vorlage(),
        daten({
          anrede: null,
          auszeichnung: 'ehrennadel',
          person: { ...daten().person, eintrittsdatum: null },
        }),
      ),
    );
    expect(formular.getCheckBox('Frau').isChecked()).toBe(false);
    expect(formular.getCheckBox('Herr').isChecked()).toBe(false);
    expect(formular.getCheckBox('Ehrennadel mit Band des').isChecked()).toBe(true);
    expect(formular.getTextField('Mitglied seit').getText() ?? '').toBe('');
  });

  it('bricht bei einer unpassenden Vorlage ab, statt halb zu füllen', async () => {
    const unpassend = await vorlage(['Text1', 'Jubiläumsuhr_2']);
    expect(await fehlendeFelder(unpassend)).toEqual(['Text1', 'Jubiläumsuhr_2']);
    await expect(ehrungsantragFuellen(unpassend, daten())).rejects.toThrow(/passt nicht/);
  });

  it('meldet eine Datei, die kein PDF ist', async () => {
    await expect(fehlendeFelder(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow(
      /kein lesbares PDF/,
    );
  });
});
