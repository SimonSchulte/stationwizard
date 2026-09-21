import { describe, expect, it } from 'vitest';
import { istSystemkonfiguration, istVersandweg } from './systemkonfiguration-pruefung';

const GUELTIG = {
  einstellungen: {
    kmBerichtEmpfaenger: 'leitung@example.test',
    kmBerichtVersandweg: 'email-routing',
    kmBerichtBetreff: 'Kilometerstandsbericht',
    materialBestellscheinEmpfaenger: '',
    materialMaengelLandEmpfaenger: '',
    materialMaengelSegEmpfaenger: '',
    materialVersandweg: 'email-routing',
    materialBetreff: 'Materialmeldung',
  },
  versandwege: [
    { weg: 'email-routing', verfuegbar: true },
    { weg: 'resend', verfuegbar: false },
  ],
};

describe('istVersandweg', () => {
  it('kennt genau die beiden umgesetzten Wege', () => {
    expect(istVersandweg('email-routing')).toBe(true);
    expect(istVersandweg('resend')).toBe(true);
    expect(istVersandweg('smtp')).toBe(false);
  });
});

describe('istSystemkonfiguration', () => {
  it('nimmt eine vollständige Antwort an', () => {
    expect(istSystemkonfiguration(GUELTIG)).toBe(true);
  });

  it('nimmt eine leere Empfängeradresse an', () => {
    const leer = {
      ...GUELTIG,
      einstellungen: { ...GUELTIG.einstellungen, kmBerichtEmpfaenger: '' },
    };
    expect(istSystemkonfiguration(leer)).toBe(true);
  });

  it('lehnt einen unbekannten Versandweg ab, statt ihn in die Oberfläche zu lassen', () => {
    const fremd = {
      ...GUELTIG,
      einstellungen: { ...GUELTIG.einstellungen, kmBerichtVersandweg: 'smtp' },
    };
    expect(istSystemkonfiguration(fremd)).toBe(false);
  });

  it('lehnt eine fehlende Verfügbarkeitsangabe ab', () => {
    expect(istSystemkonfiguration({ ...GUELTIG, versandwege: [{ weg: 'resend' }] })).toBe(false);
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(istSystemkonfiguration(null)).toBe(false);
    expect(istSystemkonfiguration('email-routing')).toBe(false);
  });
});
