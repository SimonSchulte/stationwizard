import { describe, expect, it } from 'vitest';
import { testAufbau, testAufbauInhalt, testEinheit, testId } from '../testing/aufbau-testdaten';
import { AufbauEintrag } from '../models/aufbau.model';
import {
  istAufbau,
  istAufbauInhalt,
  istAufbauVorlage,
  istAufbauVorlageKopf,
} from './aufbau-pruefung';

const artikel = (extra: Record<string, unknown> = {}) =>
  ({
    art: 'artikel',
    id: crypto.randomUUID(),
    artikelId: testId(11),
    menge: 2,
    bemerkung: '',
    lagerId: null,
    phase: null,
    ...extra,
  }) as unknown as AufbauEintrag;

describe('Prüfung des Aufbaus', () => {
  it('nimmt einen gültigen Aufbau und eine Vorlage an', () => {
    const inhalt = testAufbauInhalt([testEinheit({}, [artikel()])]);
    expect(istAufbau(testAufbau(inhalt))).toBe(true);
    expect(istAufbauVorlage({ id: testId(1), titel: 'Standard', inhalt })).toBe(true);
  });

  it.each([
    [
      'Wagen im Wagen',
      () => {
        const innen = testEinheit({ name: 'innen' });
        const aussen = testEinheit({}, [{ art: 'wagen', id: crypto.randomUUID(), einheit: innen }]);
        return testAufbauInhalt([aussen]);
      },
    ],
    [
      'doppelte Id über Ebenen',
      () => {
        const id = crypto.randomUUID();
        return testAufbauInhalt([testEinheit({ id }, [artikel({ id })])]);
      },
    ],
    ['Menge null', () => testAufbauInhalt([testEinheit({}, [artikel({ menge: 0 })])])],
    [
      'Menge mit vier Nachkommastellen',
      () => testAufbauInhalt([testEinheit({}, [artikel({ menge: 1.0001 })])]),
    ],
    ['unbekannte Phase', () => testAufbauInhalt([testEinheit({}, [artikel({ phase: 'x' })])])],
    ['unbekanntes Feld', () => testAufbauInhalt([testEinheit({ extra: 1 } as never)])],
    ['unbekannte Farbe', () => testAufbauInhalt([testEinheit({ farbe: 'rot' as never })])],
    ['Foto kein JPEG', () => testAufbauInhalt([testEinheit({ foto: 'data:image/png;base64,AA' })])],
    [
      'mehr als 60 Einheiten',
      () => testAufbauInhalt(Array.from({ length: 61 }, () => testEinheit())),
    ],
  ])('lehnt ab: %s', (_name, bauen) => {
    expect(istAufbauInhalt(bauen())).toBe(false);
  });

  it('prüft Kopfdaten der Vorlagenliste', () => {
    const kopf = {
      id: testId(1),
      titel: 'Standard',
      version: 1,
      einheiten: 2,
      kisten: 3,
      positionen: 4,
      geaendertAm: 'x',
    };
    expect(istAufbauVorlageKopf(kopf)).toBe(true);
    expect(istAufbauVorlageKopf({ ...kopf, kisten: -1 })).toBe(false);
    expect(istAufbauVorlageKopf({ ...kopf, extra: 1 })).toBe(false);
  });
});
