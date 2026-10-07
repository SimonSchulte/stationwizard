import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { zuEhrendeExcelErzeugen } from './ehrungen-excel';
import { personSchluessel, type EhrungPerson } from './ehrungen-regeln';

function person(nachname: string, ueberschreibung: Partial<EhrungPerson> = {}): EhrungPerson {
  return {
    id: nachname,
    nachname,
    vorname: 'Test',
    stunden: 0,
    stundenImport: 0,
    stundenManuell: null,
    stundenManuellStand: null,
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
        person('Fertig', { stunden: 4500, stundenImport: 4500, erhalten: { gold: 2020 } }),
      ],
      2026,
    );
    const mappe = XLSX.read(daten, { type: 'array' });
    expect(mappe.SheetNames).toEqual(['Zu Ehrende 2026', 'Warnungen']);
    const zeilen = XLSX.utils.sheet_to_json<Record<string, string>>(
      mappe.Sheets['Zu Ehrende 2026'],
    );
    expect(zeilen).toEqual([
      {
        Auszeichnung: 'Silber',
        Gruppe: 'Leistungsabzeichen',
        Nachname: 'Muster',
        Vorname: 'Test',
        Grundlage: '4.500 Stunden',
        'Bisher erhalten': 'Bronze 2012',
        'Anspruch bis': 'Gold',
        Warnung: 'Anspruch bis Gold, aber zuerst Silber vergeben.',
      },
      {
        Auszeichnung: '25 Jahre',
        Gruppe: 'Jubiläumszeichen',
        Nachname: 'Muster',
        Vorname: 'Test',
        Grundlage: '26 Jahre Mitglied (seit 01.03.2000)',
        'Bisher erhalten': '',
        'Anspruch bis': '',
        Warnung: '',
      },
    ]);
    const warnungen = XLSX.utils.sheet_to_json<Record<string, string>>(mappe.Sheets['Warnungen']);
    expect(warnungen.map((w) => `${w['Nachname']}: ${w['Warnung']}`)).toEqual([
      'Fertig: Gold erfasst, aber Bronze und Silber fehlt.',
      'Muster: Anspruch bis Gold, aber zuerst Silber vergeben.',
    ]);
  });

  it('nennt bei der Jubiläumsuhr Damen oder Herren aus der Anrede, sonst „offen“', async () => {
    const daten = await zuEhrendeExcelErzeugen(
      [
        person('Alt', { eintrittsdatum: '1990-01-01', erhalten: { 'jubilaeum-25': 2015 } }),
        person('Ohne', { eintrittsdatum: '1990-01-01', erhalten: { 'jubilaeum-25': 2015 } }),
      ],
      2026,
      new Map([[personSchluessel('Alt', 'Test'), 'Damen' as const]]),
    );
    const mappe = XLSX.read(daten, { type: 'array' });
    const zeilen = XLSX.utils.sheet_to_json<Record<string, string>>(
      mappe.Sheets['Zu Ehrende 2026'],
    );
    expect(zeilen.map((z) => `${z['Nachname']}: ${z['Auszeichnung']}`)).toEqual([
      'Alt: Jubiläumsuhr Damen 30 Jahre',
      'Ohne: Jubiläumsuhr (Damen/Herren offen) 30 Jahre',
    ]);
  });
});
