import { describe, expect, it } from 'vitest';
import {
  istAblesungEingabe,
  istFahrzeugstamm,
  istGueltigeFin,
  istKilometerstand,
} from './fahrzeug-pruefung';
import {
  erzeugeTestablesung,
  erzeugeTestfahrzeug,
  erzeugeTestwartung,
} from '../testing/fahrzeug-testdaten';

describe('istGueltigeFin', () => {
  it('akzeptiert genau 17 zulässige Zeichen', () => {
    expect(istGueltigeFin('WBA1234567890123A')).toBe(true);
  });

  it('lehnt 18 Zeichen ab', () => {
    expect(istGueltigeFin('WBA1234567890123AB')).toBe(false);
  });

  it('lehnt die verwechslungsgefährdeten Buchstaben I, O, Q ab', () => {
    expect(istGueltigeFin('WBA1234567890123I')).toBe(false);
    expect(istGueltigeFin('WBA1234567890123O')).toBe(false);
    expect(istGueltigeFin('WBA1234567890123Q')).toBe(false);
  });

  it('lehnt eine falsche Länge ab', () => {
    expect(istGueltigeFin('ZUKURZ')).toBe(false);
  });
});

describe('istFahrzeugstamm', () => {
  it('akzeptiert ein vollständiges, selbst erzeugtes Fahrzeug', () => {
    const fahrzeug = erzeugeTestfahrzeug({ wartungstermine: [erzeugeTestwartung()] });
    expect(istFahrzeugstamm(fahrzeug)).toBe(true);
  });

  it('lehnt fehlende Pflichtfelder ab', () => {
    const { id: _id, ...ohneId } = erzeugeTestfahrzeug();
    expect(istFahrzeugstamm(ohneId)).toBe(false);
  });

  it('lehnt einen unbekannten Eigentümer ab', () => {
    expect(istFahrzeugstamm(erzeugeTestfahrzeug({ eigentuemer: 'unbekannt' as never }))).toBe(
      false,
    );
  });

  it('akzeptiert eine null-Fahrgestellnummer, da optional', () => {
    expect(istFahrzeugstamm(erzeugeTestfahrzeug({ fahrgestellnummer: null }))).toBe(true);
  });

  it('lehnt einen ungültigen Wartungstermin in der Liste ab', () => {
    const fahrzeug = erzeugeTestfahrzeug({
      wartungstermine: [{ ...erzeugeTestwartung(), erinnerungTage: -1 }],
    });
    expect(istFahrzeugstamm(fahrzeug)).toBe(false);
  });

  it('lehnt rohe, unstrukturierte Werte ab, ohne zu werfen', () => {
    expect(istFahrzeugstamm(null)).toBe(false);
    expect(istFahrzeugstamm('text')).toBe(false);
    expect(istFahrzeugstamm(42)).toBe(false);
  });
});

describe('istKilometerstand', () => {
  it('akzeptiert eine vollständige Ablesung', () => {
    expect(istKilometerstand(erzeugeTestablesung())).toBe(true);
  });

  it('lehnt eine negative Kilometerangabe ab', () => {
    expect(istKilometerstand(erzeugeTestablesung({ stand: -1 }))).toBe(false);
  });

  it('lehnt eine unbekannte Quelle ab', () => {
    expect(istKilometerstand(erzeugeTestablesung({ quelle: 'unbekannt' as never }))).toBe(false);
  });
});

describe('istAblesungEingabe', () => {
  it('akzeptiert eine Eingabe ohne erfasstVon-Feld', () => {
    const eingabe = {
      fahrzeugId: 'f1',
      abgelesenAm: '2026-06-01',
      stand: 1000,
      quelle: 'qr' as const,
      korrigiert: null,
      bemerkung: '',
    };
    expect(istAblesungEingabe(eingabe)).toBe(true);
  });

  it('lehnt eine Eingabe mit falschem Datumsformat ab', () => {
    expect(
      istAblesungEingabe({
        fahrzeugId: 'f1',
        abgelesenAm: '01.06.2026',
        stand: 1000,
        quelle: 'qr',
        korrigiert: null,
        bemerkung: '',
      }),
    ).toBe(false);
  });
});
