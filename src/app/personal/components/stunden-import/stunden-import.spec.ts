import { describe, expect, it } from 'vitest';
import type { EhrungPerson } from '../../services/ehrungen-regeln';
import { stundenImportVorschau } from './stunden-import';

function person(nachname: string, vorname: string, stunden: number): EhrungPerson {
  return {
    id: `${nachname}-${vorname}`,
    nachname,
    vorname,
    stunden,
    stundenImport: stunden,
    stundenManuell: null,
    stundenManuellStand: null,
    eintrittsdatum: null,
    besondereVerdienste: false,
    erhalten: {},
    version: 1,
    geaendertAm: '2026-01-01T00:00:00.000Z',
    geaendertVon: 'erfunden@example.invalid',
  };
}

describe('stundenImportVorschau', () => {
  it('zählt neue, geänderte, unveränderte und doppelte Zeilen', () => {
    const bestand = [person('Muster', 'Max', 100), person('Beispiel', 'Erika', 50)];
    const vorschau = stundenImportVorschau(
      ['Muster, Max 100', 'Beispiel, Erika 75', 'Neu, Nina 10', 'Neu, Nina 12', 'kaputt'].join(
        '\n',
      ),
      bestand,
    );
    expect(vorschau).toMatchObject({ neu: 1, geaendert: 1, unveraendert: 1, doppelt: 1 });
    expect(vorschau.fehler).toHaveLength(1);
  });
});
