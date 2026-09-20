import { describe, expect, it } from 'vitest';
import {
  erzeugeTestAngebot,
  erzeugeTestPosition,
  erzeugeTestSchicht,
} from '../testing/angebot-testdaten';
import { istAngebot, istPosition, istSchicht } from './angebot-pruefung';

describe('istPosition', () => {
  it('akzeptiert eine gültige Einsatzkraft-Position', () => {
    expect(istPosition(erzeugeTestPosition())).toBe(true);
  });

  it('akzeptiert eine gültige Fahrzeug-Position ohne Stunden', () => {
    expect(
      istPosition(erzeugeTestPosition({ art: 'fahrzeug', bezeichnung: 'KTW/RTW', stunden: null })),
    ).toBe(true);
  });

  it('lehnt eine Fahrzeug-Position mit gesetzten Stunden ab', () => {
    expect(istPosition(erzeugeTestPosition({ art: 'fahrzeug', stunden: 5 }))).toBe(false);
  });

  it('lehnt eine Einsatzkraft-Position ohne Stunden ab', () => {
    expect(istPosition(erzeugeTestPosition({ stunden: null }))).toBe(false);
  });

  it('lehnt eine Einsatzkraft-Position mit Stunden <= 0 ab', () => {
    expect(istPosition(erzeugeTestPosition({ stunden: 0 }))).toBe(false);
  });

  it('lehnt eine nicht-ganzzahlige Anzahl ab', () => {
    expect(istPosition(erzeugeTestPosition({ anzahl: 1.5 }))).toBe(false);
  });

  it('lehnt eine Anzahl kleiner 1 ab', () => {
    expect(istPosition(erzeugeTestPosition({ anzahl: 0 }))).toBe(false);
  });
});

describe('istSchicht', () => {
  it('akzeptiert eine gültige Schicht', () => {
    expect(istSchicht(erzeugeTestSchicht())).toBe(true);
  });

  it('lehnt bis <= von ab', () => {
    expect(istSchicht(erzeugeTestSchicht({ von: '20:00', bis: '08:00' }))).toBe(false);
  });

  it('lehnt ein ungültiges Datum ab', () => {
    expect(istSchicht(erzeugeTestSchicht({ datum: '12.09.2026' }))).toBe(false);
  });

  it('lehnt eine Schicht mit einer ungültigen Position ab', () => {
    expect(
      istSchicht(erzeugeTestSchicht({ positionen: [erzeugeTestPosition({ anzahl: 0 })] })),
    ).toBe(false);
  });

  it('akzeptiert eine Schicht ohne Positionen', () => {
    expect(istSchicht(erzeugeTestSchicht({ positionen: [] }))).toBe(true);
  });
});

describe('istAngebot', () => {
  it('akzeptiert ein gültiges Angebot', () => {
    expect(istAngebot(erzeugeTestAngebot())).toBe(true);
  });

  it('akzeptiert ein Angebot ohne Schichten', () => {
    expect(istAngebot(erzeugeTestAngebot({ schichten: [] }))).toBe(true);
  });

  it('verlangt pauschalpreisCent, wenn pauschalpreisAktiv gesetzt ist', () => {
    expect(
      istAngebot(erzeugeTestAngebot({ pauschalpreisAktiv: true, pauschalpreisCent: null })),
    ).toBe(false);
  });

  it('akzeptiert pauschalpreisCent = 0 als gültigen Override', () => {
    expect(istAngebot(erzeugeTestAngebot({ pauschalpreisAktiv: true, pauschalpreisCent: 0 }))).toBe(
      true,
    );
  });

  it('akzeptiert pauschalpreisCent = null, wenn pauschalpreisAktiv false ist', () => {
    expect(
      istAngebot(erzeugeTestAngebot({ pauschalpreisAktiv: false, pauschalpreisCent: null })),
    ).toBe(true);
  });

  it('lehnt eine leere Bezeichnung ab', () => {
    expect(istAngebot(erzeugeTestAngebot({ bezeichnung: '' }))).toBe(false);
  });

  it('lehnt ein Angebot mit einer ungültigen Schicht ab', () => {
    expect(
      istAngebot(
        erzeugeTestAngebot({ schichten: [erzeugeTestSchicht({ von: '20:00', bis: '08:00' })] }),
      ),
    ).toBe(false);
  });
});
