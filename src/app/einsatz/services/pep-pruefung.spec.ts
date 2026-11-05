import { describe, expect, it } from 'vitest';
import { PEP_GRENZEN, PepInhalt } from '../models/pep.model';
import { testPep, testPepInhalt, testPepVorlage } from '../testing/pep-testdaten';
import {
  istPep,
  istPepInhalt,
  istPepVorlage,
  istPepVorlageInhalt,
  istPepVorlageKopf,
} from './pep-pruefung';

function mitPosition(aenderung: object): PepInhalt {
  const inhalt = testPepInhalt();
  inhalt.posten[0].positionen[0] = { ...inhalt.posten[0].positionen[0], ...aenderung };
  return inhalt;
}

describe('istPepInhalt', () => {
  it('akzeptiert einen gültigen und einen leeren Inhalt', () => {
    expect(istPepInhalt(testPepInhalt())).toBe(true);
    expect(
      istPepInhalt({ beschreibung: '', posten: [], einsatzkraefte: [], einsatzleiterId: null }),
    ).toBe(true);
  });

  it('lehnt unbekannte Felder ab', () => {
    expect(istPepInhalt({ ...testPepInhalt(), extra: 1 })).toBe(false);
    const inhalt = testPepInhalt();
    expect(istPepInhalt({ ...inhalt, posten: [{ ...inhalt.posten[0], extra: 1 }] })).toBe(false);
  });

  it('lehnt unbekannte Qualifikationen ab', () => {
    expect(
      istPepInhalt(
        mitPosition({ anforderungen: { taktisch: 'XX', medizinisch: null, zusatz: null } }),
      ),
    ).toBe(false);
    expect(
      istPepInhalt(
        mitPosition({ anforderungen: { taktisch: null, medizinisch: 'Arzt', zusatz: null } }),
      ),
    ).toBe(false);
    const inhalt = testPepInhalt();
    inhalt.einsatzkraefte[0].medizinisch = ['NA', 'Quatsch' as 'NA'];
    expect(istPepInhalt(inhalt)).toBe(false);
  });

  it('verlangt Verweise auf vorhandene Einsatzkräfte', () => {
    expect(istPepInhalt(mitPosition({ einsatzkraftId: 'fremd' }))).toBe(false);
    expect(istPepInhalt({ ...testPepInhalt(), einsatzleiterId: 'fremd' })).toBe(false);
    expect(istPepInhalt({ ...testPepInhalt(), einsatzleiterId: null })).toBe(true);
  });

  it('verlangt je Art eindeutige Ids', () => {
    const doppelterPosten = testPepInhalt();
    doppelterPosten.posten.push(structuredClone(doppelterPosten.posten[0]));
    expect(istPepInhalt(doppelterPosten)).toBe(false);

    const doppelt = testPepInhalt();
    doppelt.posten.push({
      ...structuredClone(doppelt.posten[0]),
      id: 'posten-2',
    });
    // gleiche Positions-Ids in einem zweiten Posten
    expect(istPepInhalt(doppelt)).toBe(false);

    const kraefte = testPepInhalt();
    kraefte.einsatzkraefte.push({ ...kraefte.einsatzkraefte[0] });
    expect(istPepInhalt(kraefte)).toBe(false);
  });

  it('prüft Textgrenzen und Pflichttexte', () => {
    const inhalt = testPepInhalt();
    expect(
      istPepInhalt({ ...inhalt, beschreibung: 'x'.repeat(PEP_GRENZEN.beschreibung + 1) }),
    ).toBe(false);
    expect(istPepInhalt({ ...inhalt, beschreibung: 'x'.repeat(PEP_GRENZEN.beschreibung) })).toBe(
      true,
    );
    const ohneTitel = testPepInhalt();
    ohneTitel.posten[0].bezeichnung = '';
    expect(istPepInhalt(ohneTitel)).toBe(false);
    // Eine Position darf leer benannt sein.
    expect(istPepInhalt(mitPosition({ bezeichnung: '' }))).toBe(true);
    const ohneName = testPepInhalt();
    ohneName.einsatzkraefte[0].name = '';
    expect(istPepInhalt(ohneName)).toBe(false);
    const zuLang = testPepInhalt();
    zuLang.einsatzkraefte[0].notiz = 'x'.repeat(PEP_GRENZEN.notiz + 1);
    expect(istPepInhalt(zuLang)).toBe(false);
    const zuvielZusatz = testPepInhalt();
    zuvielZusatz.einsatzkraefte[0].zusatz = Array(PEP_GRENZEN.zusatzJeEinsatzkraft + 1).fill('a');
    expect(istPepInhalt(zuvielZusatz)).toBe(false);
  });

  it('prüft Mengengrenzen', () => {
    const vieleKraefte = testPepInhalt();
    vieleKraefte.einsatzkraefte = Array.from(
      { length: PEP_GRENZEN.einsatzkraefte + 1 },
      (_, i) => ({
        ...vieleKraefte.einsatzkraefte[0],
        id: `k${i}`,
      }),
    );
    vieleKraefte.einsatzleiterId = null;
    vieleKraefte.posten[0].positionen[0].einsatzkraftId = null;
    expect(istPepInhalt(vieleKraefte)).toBe(false);

    const vielePositionen = testPepInhalt();
    vielePositionen.posten[0].positionen = Array.from(
      { length: PEP_GRENZEN.positionenJePosten + 1 },
      (_, i) => ({ ...testPepInhalt().posten[0].positionen[1], id: `p${i}` }),
    );
    expect(istPepInhalt(vielePositionen)).toBe(false);
  });

  it('prüft Fahrzeug und Postenfelder', () => {
    const inhalt = testPepInhalt();
    inhalt.posten[0].fahrzeug = {
      funkruf: 'x',
      seriennummer: 1 as unknown as string,
      hiorgId: null,
    };
    expect(istPepInhalt(inhalt)).toBe(false);
    const telefon = testPepInhalt();
    telefon.posten[0].telefonnummer = '1'.repeat(PEP_GRENZEN.telefonnummer + 1);
    expect(istPepInhalt(telefon)).toBe(false);
    expect(istPepInhalt(mitPosition({ postenfuehrer: 'ja' }))).toBe(false);
  });
});

describe('Vorlagen- und Hüllenprüfung', () => {
  it('prüft die PEP-Hülle', () => {
    expect(istPep(testPep())).toBe(true);
    expect(istPep(testPep({ vorlageId: crypto.randomUUID() }))).toBe(true);
    expect(istPep({ ...testPep(), schema: 2 })).toBe(false);
    expect(istPep({ ...testPep(), vorlageId: 'keine-uuid' })).toBe(false);
    expect(istPep({ ...testPep(), version: 1 })).toBe(false);
  });

  it('akzeptiert eine Vorlage nur ohne Besetzung', () => {
    expect(istPepVorlage(testPepVorlage())).toBe(true);
    const besetzt = testPepVorlage();
    besetzt.inhalt.posten[0].positionen[0].einsatzkraftId = 'kraft-1';
    expect(istPepVorlage(besetzt)).toBe(false);
    expect(istPepVorlage(testPepVorlage({ titel: '' }))).toBe(false);
    expect(istPepVorlage(testPepVorlage({ id: 'x' }))).toBe(false);
    expect(istPepVorlageInhalt({ ...testPepVorlage().inhalt, einsatzkraefte: [] })).toBe(false);
  });

  it('prüft den Vorlagenkopf', () => {
    const kopf = {
      id: crypto.randomUUID(),
      titel: 'Vorlage',
      version: 2,
      posten: 3,
      positionen: 9,
      geaendertAm: '2026-11-05T10:00:00Z',
    };
    expect(istPepVorlageKopf(kopf)).toBe(true);
    expect(istPepVorlageKopf({ ...kopf, version: 0 })).toBe(false);
    expect(istPepVorlageKopf({ ...kopf, posten: -1 })).toBe(false);
    expect(istPepVorlageKopf({ ...kopf, inhalt: {} })).toBe(false);
    expect(istPepVorlageKopf({ ...kopf, geaendertAm: '' })).toBe(false);
  });
});
