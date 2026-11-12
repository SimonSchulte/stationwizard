import { describe, expect, it } from 'vitest';
import { AufbauEinheit, AufbauEintrag } from '../models/aufbau.model';
import { Artikel, Lager } from '../models/stammdaten.model';
import { leiteZettelAb, mengeText, sortiereAushang } from './aufbau-zettel';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lager = (n: number, name: string, reihenfolge: number): Lager => ({
  id: id(n),
  name,
  reihenfolge,
  version: 1,
  geaendertAm: '',
  geaendertVon: '',
});
const artikel = (n: number, name: string, einheit: Artikel['einheit']): Artikel => ({
  id: id(n),
  name,
  einheit,
  lagerId: null,
  version: 1,
  geaendertAm: '',
  geaendertVon: '',
});
const DATEN = {
  lager: [lager(1, 'Halle A', 1), lager(2, 'Medizinlager', 2), lager(3, 'Fahrzeughalle', 3)],
  artikel: [artikel(11, 'Trinkwasser', 'Liter'), artikel(12, 'Rettungsdecke', 'Stück')],
};
const art = (n: number, artikelId: number, lagerId: number | null, extra = {}): AufbauEintrag => ({
  art: 'artikel',
  id: id(n),
  artikelId: id(artikelId),
  menge: 85,
  bemerkung: '80–90',
  lagerId: lagerId === null ? null : id(lagerId),
  phase: null,
  ...extra,
});
const kiste = (n: number, lagerId: number, extra = {}): AufbauEintrag => ({
  art: 'kiste',
  id: id(n),
  kisteId: null,
  name: 'Verbandkiste',
  lagerId: id(lagerId),
  anzahl: 2,
  inhalt: [{ artikelId: id(12), menge: 3, bemerkung: '' }],
  phase: null,
  ...extra,
});
const einheit = (
  n: number,
  inhalt: AufbauEintrag[],
  extra: Partial<AufbauEinheit> = {},
): AufbauEinheit => ({
  id: id(n),
  typ: 'wagen',
  name: `Wagen ${n}`,
  farbe: 'abschnitt-7',
  anweisung: '',
  bemerkung: '',
  inhalt,
  ...extra,
});

describe('mengeText', () => {
  it('schreibt Zahl, Einheit und Bemerkung', () => {
    expect(mengeText(85, 'Liter', '80–90')).toBe('85 Liter (80–90)');
    expect(mengeText(1.5, 'Rolle', '')).toBe('1,5 Rolle');
    expect(mengeText(2, '', '')).toBe('2');
  });
});

describe('leiteZettelAb', () => {
  it('gruppiert nach Lager im Laufweg, trennt mit einer Zeile und führt Kisten vor losen Artikeln', () => {
    const [zettel] = leiteZettelAb(
      {
        anweisungen: '',
        einheiten: [einheit(20, [art(21, 11, 1), art(22, 12, 2), kiste(23, 2), art(24, 12, 1)])],
      },
      DATEN,
    );
    expect(zettel!.posten.map((p) => (p.art === 'trenner' ? `#${p.text}` : p.text))).toEqual([
      '#Halle A',
      'Trinkwasser',
      'Rettungsdecke',
      '#Medizinlager',
      '2× Verbandkiste',
      'Rettungsdecke',
    ]);
    expect(zettel!.von).toBe('Halle A');
    expect(zettel!.belegt).toBe(6);
  });

  it('sammelt Artikel ohne Heimatlager am Ende und nennt fehlende Artikel unbekannt', () => {
    const [zettel] = leiteZettelAb(
      { anweisungen: '', einheiten: [einheit(20, [art(21, 99, null), art(22, 11, 3)])] },
      DATEN,
    );
    const texte = zettel!.posten.map((p) => p.text);
    expect(texte).toEqual([
      'Fahrzeughalle',
      'Trinkwasser',
      'Ohne Heimatlager',
      'Unbekannter Artikel',
    ]);
  });

  it('stellt Phasen vor beziehungsweise hinter die übrigen Gruppen', () => {
    const [zettel] = leiteZettelAb(
      {
        anweisungen: '',
        einheiten: [
          einheit(20, [
            art(21, 11, 1, { phase: 'zum-schluss' }),
            art(22, 12, 3),
            art(23, 12, 3, { phase: 'vorher' }),
          ]),
        ],
      },
      DATEN,
    );
    expect(zettel!.posten.filter((p) => p.art === 'trenner').map((p) => p.text)).toEqual([
      'Fahrzeughalle · zuerst',
      'Fahrzeughalle',
      'Halle A · zum Schluss',
    ]);
  });

  it('macht aus einem Wagen im Fahrzeug einen eigenen Zettel in seiner eigenen Farbe', () => {
    const wagen = einheit(30, [art(31, 11, 1)], { name: 'Rollwagen', farbe: 'abschnitt-2' });
    const fahrzeug = einheit(20, [{ art: 'wagen', id: id(21), einheit: wagen }, kiste(22, 3)], {
      typ: 'fahrzeug',
      name: 'GW-San',
      farbe: 'abschnitt-1',
    });
    const zettel = leiteZettelAb({ anweisungen: '', einheiten: [fahrzeug] }, DATEN);
    expect(zettel.map((z) => [z.nr, z.name, z.farbe, z.inFahrzeug])).toEqual([
      [1, 'GW-San', 'abschnitt-1', null],
      [2, 'Rollwagen', 'abschnitt-2', 'GW-San'],
    ]);
    expect(zettel[0]!.posten.map((p) => p.text)).toEqual([
      'Fahrzeughalle',
      '2× Verbandkiste',
      'Wagen',
      'Rollwagen (Wagen)',
    ]);
    expect(zettel[0]!.von).toBe('Fahrzeughalle');
  });

  it('sortiert einen freien Artikel nach seinem Quelllager, ohne Lager an das Ende', () => {
    const frei = (n: number, name: string, lagerId: number | null): AufbauEintrag => ({
      art: 'frei',
      id: id(n),
      name,
      einheit: 'Rollen',
      menge: 4,
      bemerkung: '',
      lagerId: lagerId === null ? null : id(lagerId),
      phase: null,
    });
    const e = einheit(20, [
      frei(21, 'Absperrband', null),
      frei(22, 'Warnweste', 2),
      art(23, 11, 1),
    ]);
    const zettel = leiteZettelAb({ anweisungen: '', einheiten: [e] }, DATEN)[0]!;
    expect(zettel.posten.map((p) => p.text)).toEqual([
      'Halle A',
      'Trinkwasser',
      'Medizinlager',
      'Warnweste',
      'Ohne Heimatlager',
      'Absperrband',
    ]);
    expect(zettel.von).toBe('Halle A');
  });

  it('meldet Fortsetzungsstreifen, sobald das Raster überläuft', () => {
    const viele = Array.from({ length: 30 }, (_, i) => art(100 + i, 11, 1));
    const [zettel] = leiteZettelAb({ anweisungen: '', einheiten: [einheit(20, viele)] }, DATEN);
    expect(zettel!.belegt).toBe(31);
    expect(zettel!.streifen).toBe(2);
    const [klein] = leiteZettelAb({ anweisungen: '', einheiten: [einheit(20, [])] }, DATEN);
    expect(klein!.streifen).toBe(1);
    expect(klein!.von).toBeNull();
  });
});

describe('sortiereAushang', () => {
  it('sortiert nach dem ersten Lager im Laufweg, bei Gleichstand nach Nummer', () => {
    const z = leiteZettelAb(
      {
        anweisungen: '',
        einheiten: [
          einheit(20, [art(21, 11, 3)]),
          einheit(30, [art(31, 11, 1)]),
          einheit(40, [art(41, 11, 1)]),
          einheit(50, []),
        ],
      },
      DATEN,
    );
    expect(sortiereAushang(z, 'lager', DATEN.lager).map((x) => x.nr)).toEqual([2, 3, 1, 4]);
    expect(sortiereAushang(z, 'nummer', DATEN.lager).map((x) => x.nr)).toEqual([1, 2, 3, 4]);
  });
});
