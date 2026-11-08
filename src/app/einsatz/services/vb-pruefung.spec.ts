import { describe, expect, it } from 'vitest';
import {
  testAbschnitt,
  testEinsatz,
  testInhalt,
  testLaufzettel,
  testPosition,
  testVorbereitung,
  testVorlage,
} from '../testing/vb-testdaten';
import {
  istEinsatz,
  istEinsatzListenEintrag,
  istVbInhalt,
  istVbVorlage,
  istVbVorlageKopf,
  istVorbereitung,
  vbInhaltProbleme,
} from './vb-pruefung';

describe('Verladungsfoto im Abschnitt', () => {
  it('akzeptiert ein JPEG-Foto und weist anderes ab', () => {
    const gut = testInhalt({
      abschnitte: [testAbschnitt({ foto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' })],
    });
    expect(istVbInhalt(gut)).toBe(true);
    for (const foto of [
      'data:image/png;base64,AAAA',
      'http://x/y.jpg',
      'data:image/jpeg;base64,',
    ]) {
      expect(istVbInhalt(testInhalt({ abschnitte: [testAbschnitt({ foto })] }))).toBe(false);
    }
  });
});

describe('istVbInhalt', () => {
  it('nimmt gültigen Inhalt an, auch ohne Abschnitte und mit leerer Anzahl', () => {
    expect(istVbInhalt(testInhalt())).toBe(true);
    expect(istVbInhalt({ anweisungen: '', abschnitte: [] })).toBe(true);
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({
          laufzettel: [testLaufzettel({ positionen: [testPosition({ anzahl: '' })] })],
        }),
      ],
    });
    expect(istVbInhalt(inhalt)).toBe(true);
  });

  it('lehnt Nicht-Objekte und fehlende Felder ab', () => {
    for (const wert of [null, 'x', 3, [], {}, { anweisungen: '' }, { abschnitte: [] }]) {
      expect(istVbInhalt(wert)).toBe(false);
    }
  });

  it('lehnt unbekannte Felder auf jeder Ebene ab', () => {
    expect(istVbInhalt({ ...testInhalt(), extra: 1 })).toBe(false);
    const a = testAbschnitt();
    expect(istVbInhalt(testInhalt({ abschnitte: [{ ...a, extra: 1 } as never] }))).toBe(false);
    const l = testLaufzettel();
    expect(
      istVbInhalt(
        testInhalt({ abschnitte: [testAbschnitt({ laufzettel: [{ ...l, x: 1 } as never] })] }),
      ),
    ).toBe(false);
    const p = testPosition();
    expect(
      istVbInhalt(
        testInhalt({
          abschnitte: [
            testAbschnitt({
              laufzettel: [testLaufzettel({ positionen: [{ ...p, x: 1 } as never] })],
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it('lehnt falsche Werte ab', () => {
    const mit = (a: Partial<ReturnType<typeof testAbschnitt>>) =>
      testInhalt({ abschnitte: [testAbschnitt(a)] });
    expect(istVbInhalt(mit({ farbe: 'abschnitt-9' as never }))).toBe(false);
    expect(istVbInhalt(mit({ fachgruppe: 'koch' as never }))).toBe(false);
    expect(istVbInhalt(mit({ titel: '' }))).toBe(false);
    expect(istVbInhalt(mit({ id: 'keine-uuid' }))).toBe(false);
    expect(
      istVbInhalt(
        mit({ laufzettel: [testLaufzettel({ positionen: [testPosition({ material: '' })] })] }),
      ),
    ).toBe(false);
    expect(
      istVbInhalt(
        mit({
          laufzettel: [testLaufzettel({ positionen: [testPosition({ anzahl: 'x'.repeat(21) })] })],
        }),
      ),
    ).toBe(false);
  });

  it('prüft Grenzen und eindeutige Ids', () => {
    expect(istVbInhalt(testInhalt({ anweisungen: 'x'.repeat(6001) }))).toBe(false);
    expect(istVbInhalt(testInhalt({ anweisungen: 'x'.repeat(6000) }))).toBe(true);
    const viele = Array.from({ length: 31 }, () => testAbschnitt({ laufzettel: [] }));
    expect(istVbInhalt(testInhalt({ abschnitte: viele }))).toBe(false);
    const positionen = Array.from({ length: 51 }, () => testPosition());
    expect(
      istVbInhalt(
        testInhalt({
          abschnitte: [testAbschnitt({ laufzettel: [testLaufzettel({ positionen })] })],
        }),
      ),
    ).toBe(false);
    const doppelt = testPosition();
    expect(
      istVbInhalt(
        testInhalt({
          abschnitte: [
            testAbschnitt({ laufzettel: [testLaufzettel({ positionen: [doppelt, doppelt] })] }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it('begrenzt die Laufzettel insgesamt auf 300', () => {
    const lz = () => Array.from({ length: 150 }, () => testLaufzettel({ positionen: [] }));
    const zwei = testInhalt({
      abschnitte: [testAbschnitt({ laufzettel: lz() }), testAbschnitt({ laufzettel: lz() })],
    });
    expect(istVbInhalt(zwei)).toBe(true);
    zwei.abschnitte[1].laufzettel.push(testLaufzettel({ positionen: [] }));
    expect(istVbInhalt(zwei)).toBe(false);
  });
});

describe('Vorbereitung, Vorlage, Kopf', () => {
  it('prüft Vorbereitung', () => {
    expect(istVorbereitung(testVorbereitung())).toBe(true);
    expect(
      istVorbereitung(testVorbereitung({ vorlageId: crypto.randomUUID(), vorlageVersion: 2 })),
    ).toBe(true);
    expect(istVorbereitung(testVorbereitung({ vorlageVersion: 0 }))).toBe(false);
    expect(istVorbereitung(testVorbereitung({ vorlageVersion: 1.5 }))).toBe(false);
    expect(istVorbereitung({ ...testVorbereitung(), extra: true })).toBe(false);
    expect(istVorbereitung({ vorlageId: null, vorlageVersion: null })).toBe(false);
  });

  it('prüft Vorlage', () => {
    expect(istVbVorlage(testVorlage())).toBe(true);
    expect(istVbVorlage(testVorlage({ titel: '' }))).toBe(false);
    expect(istVbVorlage({ id: crypto.randomUUID(), titel: 'x' })).toBe(false);
  });

  it('prüft den Listenkopf', () => {
    const kopf = {
      id: crypto.randomUUID(),
      titel: 'V',
      version: 2,
      abschnitte: 1,
      laufzettel: 2,
      positionen: 3,
      geaendertAm: '2026-01-01T00:00:00.000Z',
    };
    expect(istVbVorlageKopf(kopf)).toBe(true);
    expect(istVbVorlageKopf({ ...kopf, version: 'x' })).toBe(false);
    expect(istVbVorlageKopf({ ...kopf, positionen: -1 })).toBe(false);
    expect(istVbVorlageKopf({ ...kopf, extra: 1 })).toBe(false);
  });
});

describe('Einsatz', () => {
  it('prüft Einsatz', () => {
    expect(istEinsatz(testEinsatz())).toBe(true);
    expect(istEinsatz(testEinsatz({ beginn: null, ende: null, ort: null }))).toBe(true);
    expect(istEinsatz(testEinsatz({ hiorgVeranstaltungId: 'ab_C-1' }))).toBe(true);
    expect(istEinsatz(testEinsatz({ hiorgVeranstaltungId: 'a b' }))).toBe(false);
    expect(istEinsatz(testEinsatz({ beginn: '2026-12-05' }))).toBe(false);
    expect(istEinsatz(testEinsatz({ beginn: '2026-12-05T10:00:00Z' }))).toBe(false);
    expect(istEinsatz(testEinsatz({ titel: '' }))).toBe(false);
    expect(istEinsatz({ ...testEinsatz(), pepId: null })).toBe(false);
    expect(istEinsatz({ ...testEinsatz(), version: 1 })).toBe(false);
  });

  it('prüft den Listeneintrag mit Version und Kennzahlen', () => {
    const eintrag = {
      ...testEinsatz(),
      version: 3,
      vb: { laufzettel: 2, positionen: 9 },
      pep: null,
    };
    expect(istEinsatzListenEintrag(eintrag)).toBe(true);
    expect(istEinsatzListenEintrag({ ...eintrag, vb: null })).toBe(true);
    expect(istEinsatzListenEintrag({ ...eintrag, version: 0 })).toBe(false);
    expect(istEinsatzListenEintrag({ ...eintrag, vb: { laufzettel: 2 } })).toBe(false);
    expect(
      istEinsatzListenEintrag({ ...eintrag, vb: { laufzettel: 1, positionen: 1, x: 1 } }),
    ).toBe(false);
    expect(
      istEinsatzListenEintrag({ ...eintrag, pep: { posten: 2, positionen: 5, besetzt: 1 } }),
    ).toBe(true);
    expect(istEinsatzListenEintrag({ ...eintrag, pep: { posten: 2, positionen: 5 } })).toBe(false);
    expect(
      istEinsatzListenEintrag({ ...eintrag, pep: { posten: 2, positionen: 5, besetzt: -1 } }),
    ).toBe(false);
    expect(istEinsatzListenEintrag({ ...eintrag, pep: undefined })).toBe(false);
    expect(istEinsatzListenEintrag(testEinsatz())).toBe(false);
  });
});

describe('vbInhaltProbleme', () => {
  it('meldet nichts bei gültigem Inhalt', () => {
    expect(vbInhaltProbleme(testInhalt())).toEqual([]);
  });

  it('meldet leere Pflichttexte', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({
          titel: ' ',
          laufzettel: [testLaufzettel({ positionen: [testPosition({ material: '' })] })],
        }),
      ],
    });
    const probleme = vbInhaltProbleme(inhalt);
    expect(probleme).toContain('Jeder Abschnitt braucht einen Titel.');
    expect(probleme).toContain('Jede Position braucht eine Materialangabe.');
  });

  it('meldet überschrittene Grenzen', () => {
    expect(vbInhaltProbleme(testInhalt({ anweisungen: 'x'.repeat(6001) })).length).toBe(1);
    const positionen = Array.from({ length: 51 }, () => testPosition());
    const inhalt = testInhalt({
      abschnitte: [testAbschnitt({ laufzettel: [testLaufzettel({ positionen })] })],
    });
    expect(vbInhaltProbleme(inhalt).join()).toContain('50 Positionen');
  });
});
