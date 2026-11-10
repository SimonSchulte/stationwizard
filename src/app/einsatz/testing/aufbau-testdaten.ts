import { Aufbau, AufbauEinheit, AufbauEintrag, AufbauInhalt } from '../models/aufbau.model';
import { Artikel, Kiste, Lager } from '../models/stammdaten.model';

let zaehler = 0;
/** Deterministische UUIDs für Tests. */
export const testId = (n?: number): string =>
  `00000000-0000-4000-8000-${String(n ?? ++zaehler).padStart(12, '0')}`;

export const testLager = (n: number, name: string, reihenfolge: number): Lager => ({
  id: testId(n),
  name,
  reihenfolge,
  version: 1,
  geaendertAm: '',
  geaendertVon: '',
});

export const testArtikelStamm = (
  n: number,
  name: string,
  einheit: Artikel['einheit'] = 'Stück',
  lagerId: string | null = null,
): Artikel => ({
  id: testId(n),
  name,
  einheit,
  lagerId,
  version: 1,
  geaendertAm: '',
  geaendertVon: '',
});

export const testKiste = (
  n: number,
  name: string,
  lagerId: string | null,
  artikelId: string,
): Kiste => ({
  id: testId(n),
  name,
  lagerId,
  inhalt: [{ artikelId, menge: 3, bemerkung: '' }],
  version: 1,
  geaendertAm: '',
  geaendertVon: '',
});

export function testEinheit(
  extra: Partial<AufbauEinheit> = {},
  inhalt: AufbauEintrag[] = [],
): AufbauEinheit {
  return {
    id: crypto.randomUUID(),
    typ: 'wagen',
    name: 'Rollwagen 03',
    farbe: 'abschnitt-7',
    anweisung: '',
    bemerkung: '',
    inhalt,
    ...extra,
  };
}

export function testAufbauInhalt(einheiten: AufbauEinheit[] = [testEinheit()]): AufbauInhalt {
  return { anweisungen: '', einheiten };
}

export function testAufbau(inhalt: AufbauInhalt = testAufbauInhalt()): Aufbau {
  return { vorlageId: null, vorlageVersion: null, inhalt };
}
