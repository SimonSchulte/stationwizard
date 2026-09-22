import { describe, expect, it } from 'vitest';
import { istPruefauftrag, istServerEntwurfOderNull } from './check-pruefung';

function auftrag(entwurf: unknown): unknown {
  return {
    entwurf,
    behaelter: {
      id: 'b1',
      bezeichnung: 'NFR 1',
      bemerkung: '',
      fahrzeugBezeichnung: 'GW SAN Übung',
      fahrzeugFunkrufname: 'Florian Testort 1/59/1',
      fahrzeugGruppe: 'sanitaet',
    },
    vorlage: {
      id: 'v1',
      bezeichnung: 'Erfundene Prüfvorlage',
      grundlage: 'Erfundene Grundlage',
      version: 1,
      faecher: [],
    },
  };
}

const STAND = {
  behaelterId: 'b1',
  verfallsdatumErfasst: false,
  bemerkung: '',
  positionen: {},
};

describe('istServerEntwurfOderNull', () => {
  it('nimmt null an – kein Zwischenstand ist der Normalfall', () => {
    expect(istServerEntwurfOderNull(null)).toBe(true);
  });

  it('nimmt einen vollständigen Zwischenstand an', () => {
    expect(istServerEntwurfOderNull({ gespeichertAm: '2026-09-22T08:00:00Z', stand: STAND })).toBe(
      true,
    );
  });

  it('weist einen Zwischenstand ohne Zeitpunkt ab', () => {
    expect(istServerEntwurfOderNull({ stand: STAND })).toBe(false);
  });

  it('weist einen Stand ohne Positionen ab', () => {
    const ohnePositionen = { ...STAND, positionen: undefined };
    expect(
      istServerEntwurfOderNull({ gespeichertAm: '2026-09-22T08:00:00Z', stand: ohnePositionen }),
    ).toBe(false);
  });

  it('weist undefined ab – ein fehlendes Feld ist kein leerer Zwischenstand', () => {
    expect(istServerEntwurfOderNull(undefined)).toBe(false);
  });
});

describe('istPruefauftrag mit Zwischenstand', () => {
  it('nimmt einen Auftrag ohne Zwischenstand an', () => {
    expect(istPruefauftrag(auftrag(null))).toBe(true);
  });

  it('nimmt einen Auftrag mit Zwischenstand an', () => {
    expect(istPruefauftrag(auftrag({ gespeichertAm: '2026-09-22T08:00:00Z', stand: STAND }))).toBe(
      true,
    );
  });

  it('weist einen Auftrag mit kaputtem Zwischenstand ab, statt ihn halb zu übernehmen', () => {
    expect(istPruefauftrag(auftrag({ gespeichertAm: '2026-09-22T08:00:00Z' }))).toBe(false);
  });

  it('weist einen Auftrag ohne das Feld ab', () => {
    const ohneFeld = auftrag(null) as Record<string, unknown>;
    delete ohneFeld['entwurf'];
    expect(istPruefauftrag(ohneFeld)).toBe(false);
  });
});
