import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { zuEhrendeExcelErzeugen } from './ehrungen-excel';
import type { EhrungPerson } from './ehrungen-regeln';

function person(nachname: string, ueberschreibung: Partial<EhrungPerson> = {}): EhrungPerson {
  return {
    id: nachname,
    nachname,
    vorname: 'Test',
    stunden: 0,
    eintrittsdatum: null,
    besondereVerdienste: false,
    erhalten: {},
    version: 1,
    geaendertAm: 'x',
    geaendertVon: 'y',
    ...ueberschreibung,
  };
}

describe('Export „Zu Ehrende“', () => {
  it('schreibt eine Zeile je offener Ehrung mit Grundlage und Bisherigem', async () => {
    const daten = await zuEhrendeExcelErzeugen(
      [
        person('Muster', {
          stunden: 4500,
          erhalten: { bronze: 2012 },
          eintrittsdatum: '2000-03-01',
        }),
        person('Fertig', { stunden: 4500, erhalten: { gold: 2020 } }),
      ],
      2026,
    );
    const mappe = XLSX.read(daten, { type: 'array' });
    expect(mappe.SheetNames).toEqual(['Zu Ehrende 2026']);
    const zeilen = XLSX.utils.sheet_to_json<Record<string, string>>(
      mappe.Sheets['Zu Ehrende 2026'],
    );
    expect(zeilen).toEqual([
      {
        Auszeichnung: 'Gold',
        Gruppe: 'Leistungsabzeichen',
        Nachname: 'Muster',
        Vorname: 'Test',
        Grundlage: '4.500 Stunden',
        'Bisher erhalten': 'Bronze 2012',
      },
      {
        Auszeichnung: '25 Jahre',
        Gruppe: 'Jubiläumszeichen',
        Nachname: 'Muster',
        Vorname: 'Test',
        Grundlage: '26 Jahre Mitglied (seit 01.03.2000)',
        'Bisher erhalten': '',
      },
    ]);
  });
});
