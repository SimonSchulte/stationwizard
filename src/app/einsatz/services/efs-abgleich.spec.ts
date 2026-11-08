import { describe, expect, it } from 'vitest';
import type { EfsEinsatzGruppe } from '../models/efs.model';
import { gleicheMitEfsAb, normalisiereTitel, titelAehnlichkeit } from './efs-abgleich';

function gruppe(id: string, titel: string, von: string, bis = von): EfsEinsatzGruppe {
  return { veranstaltung_id: id, titel, datum_von: von, datum_bis: bis, schichten: [] };
}

describe('normalisiereTitel', () => {
  it('ignoriert Schreibweise, Umlaute, Satzzeichen und Leerraum', () => {
    expect(normalisiereTitel('  Fahren im geschlossenen Verband,  Theorie & Praxis ')).toBe(
      'fahren im geschlossenen verband theorie praxis',
    );
    expect(normalisiereTitel('Übung Größe')).toBe('uebung groesse');
  });
});

describe('titelAehnlichkeit', () => {
  it('misst den Anteil gemeinsamer Wörter', () => {
    expect(
      titelAehnlichkeit('Sanitätsdienst Stadtlauf', 'Sanitätsdienst Stadtlauf 2026'),
    ).toBeCloseTo(2 / 3);
    expect(titelAehnlichkeit('Stadtlauf', 'Weihnachtsmarkt')).toBe(0);
    expect(titelAehnlichkeit('', 'Stadtlauf')).toBe(0);
  });
});

describe('gleicheMitEfsAb', () => {
  const verband = gruppe(
    'a',
    'Fahren im geschlossenen Verband, Theorie und Praxis',
    '2026-11-21T09:00:00',
    '2026-11-21T17:00:00',
  );

  it('findet einen Termin über den gleichen Titel am gleichen Tag', () => {
    const ergebnis = gleicheMitEfsAb(
      'Fahren im geschlossenen Verband, Theorie und Praxis',
      '2026-11-21T09:00',
      [verband, gruppe('b', 'Weihnachtsmarkt', '2026-11-21T10:00:00')],
    );
    expect(ergebnis.art).toBe('treffer');
    expect(ergebnis.treffer?.veranstaltung_id).toBe('a');
  });

  it('vergleicht ohne Groß-/Kleinschreibung und Satzzeichen', () => {
    const ergebnis = gleicheMitEfsAb(
      'FAHREN IM GESCHLOSSENEN VERBAND – Theorie und Praxis',
      '2026-11-21T09:00',
      [verband],
    );
    expect(ergebnis.art).toBe('treffer');
  });

  it('ordnet einen gleichen Titel an einem anderen Tag nicht zu (Serientermine)', () => {
    expect(
      gleicheMitEfsAb('Fahren im geschlossenen Verband, Theorie und Praxis', '2026-11-28T09:00', [
        verband,
      ]).art,
    ).toBe('keiner');
  });

  it('trifft auch einen mehrtägigen EFS-Einsatz an einem seiner Tage', () => {
    const mehr = gruppe('m', 'Zeltlager', '2026-07-10T08:00:00', '2026-07-12T18:00:00');
    expect(gleicheMitEfsAb('Zeltlager', '2026-07-11T10:00', [mehr]).treffer?.veranstaltung_id).toBe(
      'm',
    );
  });

  it('legt ähnliche Titel am selben Tag zur Prüfung vor, den besten zuerst', () => {
    const ergebnis = gleicheMitEfsAb('Sanitätsdienst Stadtlauf', '2026-12-05T08:00', [
      gruppe('x', 'Sanitätsdienst Stadtlauf Streckenposten Nord', '2026-12-05T07:00:00'),
      gruppe('y', 'Sanitätsdienst Stadtlauf 2026', '2026-12-05T08:00:00'),
      gruppe('z', 'Stadtlauf Verpflegung', '2026-12-05T08:00:00'),
    ]);
    expect(ergebnis.art).toBe('pruefen');
    expect(ergebnis.kandidaten.map((k) => k.gruppe.veranstaltung_id)).toEqual(['y', 'x']);
    expect(ergebnis.treffer).toBeNull();
  });

  it('verlangt eine Prüfung, wenn zwei Veranstaltungen gleichen Titel und Tag haben', () => {
    const ergebnis = gleicheMitEfsAb('Zeltlager', '2026-07-11T10:00', [
      gruppe('1', 'Zeltlager', '2026-07-11T08:00:00'),
      gruppe('2', 'Zeltlager', '2026-07-11T14:00:00'),
    ]);
    expect(ergebnis.art).toBe('pruefen');
    expect(ergebnis.kandidaten).toHaveLength(2);
  });

  it('meldet „keiner“ ohne Beginn, ohne Titel oder ohne Ähnlichkeit', () => {
    expect(gleicheMitEfsAb('Zeltlager', null, [verband]).art).toBe('keiner');
    expect(gleicheMitEfsAb('  ', '2026-11-21T09:00', [verband]).art).toBe('keiner');
    expect(gleicheMitEfsAb('Dienstabend Sanitätsgruppe', '2026-11-21T19:00', [verband]).art).toBe(
      'keiner',
    );
  });
});
