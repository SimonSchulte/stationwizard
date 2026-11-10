import { describe, expect, it } from 'vitest';
import { testEinsatz } from '../testing/druck-testdaten';
import { istEinsatz, istEinsatzListenEintrag } from './einsatz-pruefung';

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
      aufbau: { einheiten: 2, kisten: 1, positionen: 9 },
      pep: null,
    };
    expect(istEinsatzListenEintrag(eintrag)).toBe(true);
    expect(istEinsatzListenEintrag({ ...eintrag, aufbau: null })).toBe(true);
    expect(istEinsatzListenEintrag({ ...eintrag, version: 0 })).toBe(false);
    expect(istEinsatzListenEintrag({ ...eintrag, aufbau: { einheiten: 2 } })).toBe(false);
    expect(
      istEinsatzListenEintrag({
        ...eintrag,
        aufbau: { einheiten: 1, kisten: 0, positionen: 1, x: 1 },
      }),
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
