import { describe, expect, it } from 'vitest';
import { leseCsv, schreibeCsv } from './csv';

describe('CSV aus Tabellenkalkulationen', () => {
  it('liest eine semikolongetrennte Tabelle mit Kopfzeile', () => {
    const tabelle = leseCsv('Bezeichnung;Kennzeichen\nMTW 1;XY-TE 123\nGW-San;XY-TE 456\n');
    expect(tabelle.trenner).toBe(';');
    expect(tabelle.kopf).toEqual(['bezeichnung', 'kennzeichen']);
    expect(tabelle.zeilen).toEqual([
      ['MTW 1', 'XY-TE 123'],
      ['GW-San', 'XY-TE 456'],
    ]);
  });

  it('erkennt Komma und Tabulator als Trenner', () => {
    expect(leseCsv('a,b,c\n1,2,3').trenner).toBe(',');
    expect(leseCsv('a\tb\tc\n1\t2\t3').trenner).toBe('\t');
  });

  it('bevorzugt bei Gleichstand das Semikolon', () => {
    expect(leseCsv('a;b,c\n1;2,3').trenner).toBe(';');
  });

  it('entfernt ein Byte-Order-Mark vor der ersten Spalte', () => {
    expect(leseCsv('﻿Bezeichnung;Kennzeichen\nMTW 1;XY-TE 123').kopf).toEqual([
      'bezeichnung',
      'kennzeichen',
    ]);
  });

  it('liest Trenner und Zeilenumbrüche innerhalb von Anführungszeichen als Inhalt', () => {
    const tabelle = leseCsv('bemerkung;kennzeichen\n"Werkstatt; dann\nPrüfung";XY-TE 123');
    expect(tabelle.zeilen).toEqual([['Werkstatt; dann\nPrüfung', 'XY-TE 123']]);
  });

  it('liest verdoppelte Anführungszeichen als einzelnes Zeichen', () => {
    expect(leseCsv('a;b\n"Sagt ""Hallo""";x').zeilen).toEqual([['Sagt "Hallo"', 'x']]);
  });

  it('kommt mit CRLF und einer abschließenden Zeilenschaltung zurecht', () => {
    const tabelle = leseCsv('a;b\r\n1;2\r\n');
    expect(tabelle.zeilen).toEqual([['1', '2']]);
  });

  it('überspringt Leerzeilen mitten in der Datei', () => {
    expect(leseCsv('a;b\n1;2\n\n;\n3;4').zeilen).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('liefert für eine leere Datei eine leere Tabelle', () => {
    expect(leseCsv('')).toEqual({ kopf: [], zeilen: [], trenner: ';' });
  });

  it('schreibt mit Byte-Order-Mark, Semikolon und maskiert Sonderzeichen', () => {
    const text = schreibeCsv(['a', 'b'], [['Werkstatt; morgen', 'Sagt "Hallo"']]);
    expect(text.startsWith('﻿a;b\r\n')).toBe(true);
    expect(text).toContain('"Werkstatt; morgen";"Sagt ""Hallo"""');
  });

  it('liest zurück, was es geschrieben hat', () => {
    const text = schreibeCsv(['bezeichnung', 'bemerkung'], [['MTW 1', 'Zeile\nZeile']]);
    expect(leseCsv(text).zeilen).toEqual([['MTW 1', 'Zeile\nZeile']]);
  });
});
