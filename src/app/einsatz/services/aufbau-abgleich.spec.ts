import { describe, expect, it } from 'vitest';
import {
  testAufbauInhalt,
  testArtikelStamm,
  testEinheit,
  testKiste,
  testLager,
} from '../testing/aufbau-testdaten';
import { AufbauKistenEintrag } from '../models/aufbau.model';
import { artikelHinzufuegen, freieKisteHinzufuegen, kisteHinzufuegen } from './aufbau-bearbeiten';
import { kisteWeichtAb, pruefeAufbau } from './aufbau-abgleich';

const lager = testLager(1, 'Halle A', 1);
const wasser = testArtikelStamm(11, 'Trinkwasser', 'Liter', lager.id);
const ohneLager = testArtikelStamm(12, 'Kabel', 'Stück', null);
const kiste = testKiste(21, 'Verbandkiste', lager.id, wasser.id);
const DATEN = { lager: [lager], artikel: [wasser, ohneLager], kisten: [kiste] };

describe('kisteWeichtAb', () => {
  const eintrag = (): AufbauKistenEintrag => {
    const e = testEinheit();
    return kisteHinzufuegen(testAufbauInhalt([e]), e.id, kiste).einheiten[0]!
      .inhalt[0] as AufbauKistenEintrag;
  };
  it('erkennt Gleichheit und jede Abweichung', () => {
    expect(kisteWeichtAb(eintrag(), kiste)).toBe(false);
    expect(kisteWeichtAb(eintrag(), { ...kiste, name: 'Andere' })).toBe(true);
    expect(kisteWeichtAb(eintrag(), { ...kiste, lagerId: null })).toBe(true);
    expect(kisteWeichtAb(eintrag(), { ...kiste, inhalt: [] })).toBe(true);
    expect(
      kisteWeichtAb(eintrag(), { ...kiste, inhalt: [{ ...kiste.inhalt[0]!, menge: 4 }] }),
    ).toBe(true);
  });
});

describe('pruefeAufbau', () => {
  it('meldet leere Einheit und fehlendes Foto als Hinweis', () => {
    const e = testEinheit();
    const p = pruefeAufbau(testAufbauInhalt([e]), DATEN);
    expect(p.map((x) => [x.art, x.schwere])).toEqual([
      ['leere-einheit', 'hinweis'],
      ['ohne-foto', 'hinweis'],
    ]);
  });

  it('meldet Artikel ohne Lager und entfallene Artikel als Fehler', () => {
    const e = testEinheit({ foto: 'data:image/jpeg;base64,AAAA' });
    let inhalt = artikelHinzufuegen(testAufbauInhalt([e]), e.id, ohneLager);
    inhalt = artikelHinzufuegen(inhalt, e.id, testArtikelStamm(99, 'Weg', 'Stück', lager.id));
    const p = pruefeAufbau(inhalt, DATEN);
    expect(p.map((x) => [x.art, x.schwere])).toEqual([
      ['ohne-heimatlager', 'fehler'],
      ['artikel-entfallen', 'fehler'],
    ]);
  });

  it('meldet eine Kiste ohne Inhalt als Fehler, weil der Packzettel nichts kontrollieren kann', () => {
    const e = testEinheit({ name: 'GW' });
    let inhalt = freieKisteHinzufuegen(testAufbauInhalt([e]), e.id, 'TeSi Mat', 1);
    inhalt = kisteHinzufuegen(inhalt, e.id, kiste);
    const probleme = pruefeAufbau(inhalt, DATEN).filter((p) => p.art === 'kiste-ohne-inhalt');
    expect(probleme).toHaveLength(1);
    expect(probleme[0]).toMatchObject({ schwere: 'fehler', einheitId: e.id });
    expect(probleme[0]!.text).toContain('TeSi Mat');
  });

  it('meldet abweichende und entfallene Kisten', () => {
    const e = testEinheit({ foto: 'data:image/jpeg;base64,AAAA' });
    const inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, kiste);
    expect(pruefeAufbau(inhalt, DATEN)).toEqual([]);
    expect(
      pruefeAufbau(inhalt, { ...DATEN, kisten: [{ ...kiste, name: 'Neu' }] }).map((x) => x.art),
    ).toEqual(['kiste-weicht-ab']);
    expect(pruefeAufbau(inhalt, { ...DATEN, kisten: [] }).map((x) => x.art)).toEqual([
      'kiste-entfallen',
    ]);
  });

  it('meldet einen Zettel, der mehrere Streifen braucht', () => {
    const e = testEinheit({ foto: 'data:image/jpeg;base64,AAAA' });
    let inhalt = testAufbauInhalt([e]);
    for (let i = 0; i < 30; i++) inhalt = artikelHinzufuegen(inhalt, e.id, wasser);
    const p = pruefeAufbau(inhalt, DATEN);
    expect(p.map((x) => x.art)).toEqual(['zettel-zu-voll']);
    expect(p[0]!.text).toContain('2 Streifen');
  });
});
