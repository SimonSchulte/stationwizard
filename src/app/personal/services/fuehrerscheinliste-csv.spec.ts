import { describe, expect, it } from 'vitest';
import type { HiorgPerson } from '../../kern/hiorg/hiorg-personal.service';
import { fuehrerscheindatumAnzeige, fuehrerscheinlisteCsv } from './fuehrerscheinliste-csv';

function person(daten: Partial<HiorgPerson> = {}): HiorgPerson {
  return {
    id: 'a',
    vorname: 'Erika',
    nachname: 'Beispiel',
    gruppen: [],
    qualifikationen: [],
    ...daten,
  };
}

describe('fuehrerscheindatumAnzeige', () => {
  it('formatiert ein erkennbares ISO-Datum deutsch', () => {
    expect(fuehrerscheindatumAnzeige('1995-11-01')).toBe('01.11.1995');
  });

  it('lässt einen unerkennbaren Wert unverändert', () => {
    expect(fuehrerscheindatumAnzeige('unbekannt')).toBe('unbekannt');
  });

  it('liefert einen leeren Text ohne Wert', () => {
    expect(fuehrerscheindatumAnzeige(null)).toBe('');
    expect(fuehrerscheindatumAnzeige(undefined)).toBe('');
  });
});

describe('fuehrerscheinlisteCsv', () => {
  it('enthält Kopfzeile, Name und alle Fahrerlaubnisangaben', () => {
    const csv = fuehrerscheinlisteCsv([
      person({
        fahrerlaubnis: {
          klassen: ['AM', 'B', 'BE'],
          beschraenkung: 'C1 171',
          fuehrerscheinnummer: '7B9205K0C65',
          fuehrerscheindatum: '1995-11-01',
        },
      }),
    ]);
    expect(csv).toContain(
      'Nachname;Vorname;Klassen;Beschränkung;Führerscheinnummer;Führerscheindatum',
    );
    expect(csv).toContain('Beispiel;Erika;AM, B, BE;C1 171;7B9205K0C65;01.11.1995');
  });

  it('nimmt eine Person ohne erfasste Fahrerlaubnis mit leeren Spalten auf', () => {
    const csv = fuehrerscheinlisteCsv([person({ fahrerlaubnis: null })]);
    expect(csv).toContain('Beispiel;Erika;;;;');
  });
});
