import { describe, expect, it } from 'vitest';
import { testDarstellung } from '../testing/vorgang-testdaten';
import {
  istUnterschrieben,
  istVorgangKopf,
  leseVorgangsdarstellung,
  pflichtUnterschriftenAnzahl,
} from './vorgang.model';
import { fehlendePflichtangaben, neueMeldung } from './schadensmeldung.model';
import { testMeldung, testUnterschriften } from '../testing/vorgang-testdaten';

describe('leseVorgangsdarstellung', () => {
  it('nimmt eine gültige Antwort an', () => {
    const daten = testDarstellung();
    expect(leseVorgangsdarstellung(JSON.parse(JSON.stringify(daten)))).toEqual(daten);
  });

  it.each([
    ['kein Objekt', null],
    ['Stufe außerhalb', { vorgang: { stufe: 9 } }],
    ['Unterschriften keine Liste', { ...testDarstellung(), unterschriften: 'x' }],
    [
      'unbekannter Status',
      {
        ...testDarstellung(),
        unterschriften: [{ ...testUnterschriften()[0], status: 'fertig' }],
      },
    ],
    [
      'ungültige Signatur',
      {
        ...testDarstellung(),
        unterschriften: [
          { ...testUnterschriften()[0], status: 'unterschrieben', signatur: { art: 'bild' } },
        ],
      },
    ],
    ['Meldung ohne Inhalt', { ...testDarstellung(), meldung: { id: 'm' } }],
  ])('lehnt %s ab', (_name, wert) => {
    expect(leseVorgangsdarstellung(wert)).toBeNull();
  });

  it('prüft den Kopf eines Vorgangs', () => {
    expect(istVorgangKopf(testDarstellung().vorgang)).toBe(true);
    expect(istVorgangKopf({ ...testDarstellung().vorgang, stufe: 1.5 })).toBe(false);
  });
});

describe('Unterschriften zählen', () => {
  it('zählt nur die Pflichtfelder', () => {
    const stand = testUnterschriften({
      fest: { status: 'unterschrieben' },
      leitung: { status: 'unterschrieben' },
    });
    expect(pflichtUnterschriftenAnzahl(stand)).toBe(1);
    expect(istUnterschrieben(stand)).toBe(false);
    stand[2].status = 'unterschrieben';
    expect(istUnterschrieben(stand)).toBe(true);
  });
});

describe('Schadensmeldung', () => {
  it('belegt eine neue Meldung vor und kürzt auf die Feldgrenzen', () => {
    const meldung = neueMeldung({
      bezeichnung: 'x'.repeat(60),
      kennzeichen: 'XX-HS 110',
      einheit: 'BI EE 04',
      heute: '2026-11-24',
    });
    expect(meldung.bezeichnung).toHaveLength(40);
    expect(meldung.stellungnahme).toBe('Der Sachverhalt wird wie oben beschrieben bestätigt.');
    expect(meldung.datumFeststellung).toBe('2026-11-24');
    expect(fehlendePflichtangaben(meldung)).toEqual(['Sachverhalt']);
  });

  it('meldet fehlende Pflichtangaben', () => {
    expect(fehlendePflichtangaben(testMeldung())).toEqual([]);
    expect(fehlendePflichtangaben(testMeldung({ einheit: ' ', datumFeststellung: '' }))).toEqual([
      'Datum der Feststellung',
      'Einheit',
    ]);
  });
});
