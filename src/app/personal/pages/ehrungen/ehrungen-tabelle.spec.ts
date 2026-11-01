import { describe, expect, it } from 'vitest';
import type { EhrungPerson } from '../../services/ehrungen-regeln';
import { passtZuFilter, sortiereZeilen, stimmtUeberein, zeileBerechnen } from './ehrungen-tabelle';

function person(nachname: string, ueberschreibung: Partial<EhrungPerson> = {}): EhrungPerson {
  return {
    id: nachname,
    nachname,
    vorname: 'Erika',
    stunden: 0,
    stundenImport: 0,
    stundenManuell: null,
    stundenManuellStand: null,
    eintrittsdatum: null,
    besondereVerdienste: false,
    erhalten: {},
    version: 1,
    geaendertAm: '2026-01-01T00:00:00.000Z',
    geaendertVon: 'erfunden@example.invalid',
    ...ueberschreibung,
  };
}

describe('Ehrungstabelle', () => {
  it('rechnet mit dem Entwurf statt mit dem gespeicherten Stand', () => {
    const gespeichert = person('Muster', { stundenImport: 500, stunden: 500 });
    const zeile = zeileBerechnen(
      gespeichert,
      {
        stundenManuell: 1500,
        stundenManuellStand: 2026,
        eintrittsdatum: null,
        besondereVerdienste: false,
        erhalten: {},
      },
      2026,
    );
    expect(zeile.geaendert).toBe(true);
    expect(zeile.aktuell.stunden).toBe(1500);
    expect(zeile.ansprueche.leistung.naechste).toBe('bronze');
    expect(passtZuFilter(zeile, [], 'faellig')).toBe(true);
    expect(passtZuFilter(zeile, [], 'erhalten')).toBe(false);
  });

  it('erkennt einen Entwurf ohne fachliche Änderung', () => {
    const a = { ...zeileBerechnen(person('A'), undefined, 2026).stand, erhalten: { bronze: 2020 } };
    expect(stimmtUeberein(a, { ...a, erhalten: { bronze: 2020 } })).toBe(true);
    expect(stimmtUeberein(a, { ...a, erhalten: { bronze: null } })).toBe(false);
  });

  it('sortiert nach Stunden und bei Gleichstand nach Namen', () => {
    const zeilen = [
      zeileBerechnen(person('Zett', { stundenImport: 10, stunden: 10 }), undefined, 2026),
      zeileBerechnen(person('Alpha', { stundenImport: 10, stunden: 10 }), undefined, 2026),
      zeileBerechnen(person('Mitte', { stundenImport: 99, stunden: 99 }), undefined, 2026),
    ];
    expect(sortiereZeilen(zeilen, 'stunden', 'desc').map((z) => z.person.nachname)).toEqual([
      'Mitte',
      'Alpha',
      'Zett',
    ]);
  });
});
