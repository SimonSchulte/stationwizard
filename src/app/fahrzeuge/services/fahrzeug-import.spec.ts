import { describe, expect, it } from 'vitest';
import {
  berichtCsv,
  leseFahrzeugImport,
  normalisiereKennzeichen,
  vorlageCsv,
  VORGABE_ERINNERUNG_TAGE,
} from './fahrzeug-import';

const KOPF =
  'bezeichnung;kennzeichen;funkrufname;fahrgestellnummer;eigentuemer;bemerkung;hu_faellig;hu_erinnerung_tage';

function ohneBestand(): ReadonlySet<string> {
  return new Set<string>();
}

describe('Fahrzeug-Stammdatenimport', () => {
  it('übernimmt eine vollständige Zeile', () => {
    const vorschau = leseFahrzeugImport(
      `${KOPF}\nMTW 1;XY-TE 123;Florian Testort 1/19/1;WDB12345678901ABC;Land NRW;Neu beschafft;2027-04-30;45`,
      ohneBestand(),
    );
    expect(vorschau.spaltenfehler).toEqual([]);
    expect(vorschau.zeilen).toHaveLength(1);
    const [zeile] = vorschau.zeilen;
    expect(zeile.befund).toBe('uebernehmen');
    expect(zeile.zeilennummer).toBe(2);
    expect(zeile.fahrzeug).toMatchObject({
      bezeichnung: 'MTW 1',
      kennzeichen: 'XY-TE 123',
      funkrufname: 'Florian Testort 1/19/1',
      fahrgestellnummer: 'WDB12345678901ABC',
      eigentuemer: 'land-nrw',
      bemerkung: 'Neu beschafft',
    });
    expect(zeile.fahrzeug?.wartungstermine).toEqual([
      expect.objectContaining({
        art: 'hu',
        bezeichnung: 'Hauptuntersuchung',
        faelligAm: '2027-04-30',
        erinnerungTage: 45,
        erledigtAm: null,
      }),
    ]);
  });

  it('kommt mit nur den Pflichtspalten aus', () => {
    const vorschau = leseFahrzeugImport('bezeichnung;kennzeichen\nMTW 1;XY-TE 123', ohneBestand());
    expect(vorschau.zeilen[0].befund).toBe('uebernehmen');
    expect(vorschau.zeilen[0].fahrzeug).toMatchObject({
      eigentuemer: 'organisation',
      funkrufname: '',
      fahrgestellnummer: null,
      bemerkung: '',
      wartungstermine: [],
    });
  });

  it('sperrt den Import, wenn eine Pflichtspalte fehlt', () => {
    const vorschau = leseFahrzeugImport('bezeichnung;funkrufname\nMTW 1;1/19/1', ohneBestand());
    expect(vorschau.spaltenfehler).toEqual(['Pflichtspalte „kennzeichen" fehlt in der Kopfzeile.']);
    expect(vorschau.zeilen).toEqual([]);
  });

  it('weist Zeilen ohne Bezeichnung oder Kennzeichen ab', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen\n;XY-TE 123\nMTW 1;',
      ohneBestand(),
    );
    expect(vorschau.zeilen.map((z) => z.befund)).toEqual(['fehler', 'fehler']);
    expect(vorschau.zeilen[0].meldungen).toContain('Bezeichnung fehlt.');
    expect(vorschau.zeilen[1].meldungen).toContain('Kennzeichen fehlt.');
  });

  it('liest die HU-Fälligkeit auch im deutschen Datumsformat', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen;hu_faellig\nMTW 1;XY-TE 123;5.4.2027',
      ohneBestand(),
    );
    expect(vorschau.zeilen[0].fahrzeug?.wartungstermine[0]).toMatchObject({
      faelligAm: '2027-04-05',
      erinnerungTage: VORGABE_ERINNERUNG_TAGE,
    });
  });

  it('weist eine unlesbare HU-Fälligkeit ab, ohne die übrigen Zeilen zu stören', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen;hu_faellig\nMTW 1;XY-TE 123;demnächst\nGW-San;XY-TE 456;2027-01-31',
      ohneBestand(),
    );
    expect(vorschau.zeilen.map((z) => z.befund)).toEqual(['fehler', 'uebernehmen']);
    expect(vorschau.zeilen[0].meldungen[0]).toContain('ist kein Datum');
  });

  it('weist eine ungültige Fahrgestellnummer und einen unbekannten Eigentümer ab', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen;fahrgestellnummer;eigentuemer\nMTW 1;XY-TE 123;ZUKURZ;Land NRW\nGW-San;XY-TE 456;;Kreis',
      ohneBestand(),
    );
    expect(vorschau.zeilen[0].meldungen[0]).toContain('keine gültige FIN');
    expect(vorschau.zeilen[1].meldungen[0]).toContain('ist unbekannt');
    expect(vorschau.zeilen.every((z) => z.befund === 'fehler')).toBe(true);
  });

  it('meldet eine Erinnerung ohne HU-Fälligkeit als folgenlos, weist die Zeile aber nicht ab', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen;hu_erinnerung_tage\nMTW 1;XY-TE 123;20',
      ohneBestand(),
    );
    expect(vorschau.zeilen[0].befund).toBe('uebernehmen');
    expect(vorschau.zeilen[0].meldungen).toContain(
      'Erinnerung ohne HU-Fälligkeit bleibt ohne Wirkung.',
    );
  });

  it('weist ein bereits vorhandenes Kennzeichen ab', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen\nMTW 1;XY-TE 123',
      new Set(['XYTE123']),
    );
    expect(vorschau.zeilen[0].befund).toBe('dublette-bestand');
    expect(vorschau.zeilen[0].fahrzeug).toBeNull();
  });

  it('weist die zweite Zeile mit demselben Kennzeichen innerhalb der Datei ab', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen\nMTW 1;XY-TE 123\nMTW 2;xy te123',
      ohneBestand(),
    );
    expect(vorschau.zeilen.map((z) => z.befund)).toEqual(['uebernehmen', 'dublette-datei']);
  });

  it('erkennt Schreibvarianten desselben Kennzeichens als gleich', () => {
    expect(normalisiereKennzeichen('me-xx 123')).toBe(normalisiereKennzeichen('ME XX123'));
    expect(normalisiereKennzeichen('XY-TE 123')).toBe('XYTE123');
  });

  it('übergeht unbekannte Spalten mit einem Hinweis', () => {
    const vorschau = leseFahrzeugImport(
      'bezeichnung;kennzeichen;farbe\nMTW 1;XY-TE 123;rot',
      ohneBestand(),
    );
    expect(vorschau.hinweise[0]).toContain('farbe');
    expect(vorschau.zeilen[0].befund).toBe('uebernehmen');
  });

  it('meldet eine Datei ohne Datenzeilen', () => {
    expect(leseFahrzeugImport('bezeichnung;kennzeichen\n', ohneBestand()).spaltenfehler).toEqual([
      'Die Datei enthält außer der Kopfzeile keine Zeilen.',
    ]);
    expect(leseFahrzeugImport('', ohneBestand()).spaltenfehler).toEqual(['Die Datei ist leer.']);
  });

  it('liefert eine Vorlage, die sich selbst wieder einlesen lässt', () => {
    const vorschau = leseFahrzeugImport(vorlageCsv(), ohneBestand());
    expect(vorschau.spaltenfehler).toEqual([]);
    expect(vorschau.zeilen.every((z) => z.befund === 'uebernehmen')).toBe(true);
  });

  it('schreibt einen Bericht mit Ergebnis und Grund', () => {
    const text = berichtCsv([
      {
        zeilennummer: 2,
        kennzeichen: 'XY-TE 123',
        bezeichnung: 'MTW 1',
        angelegt: true,
        grund: '',
      },
      {
        zeilennummer: 3,
        kennzeichen: 'XY-TE 456',
        bezeichnung: 'GW-San',
        angelegt: false,
        grund: 'Bereits vorhanden.',
      },
    ]);
    expect(text).toContain('2;XY-TE 123;MTW 1;angelegt;');
    expect(text).toContain('3;XY-TE 456;GW-San;abgewiesen;Bereits vorhanden.');
  });
});
