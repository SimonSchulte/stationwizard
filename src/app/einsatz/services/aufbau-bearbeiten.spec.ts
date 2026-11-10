import { describe, expect, it } from 'vitest';
import {
  testAufbauInhalt,
  testArtikelStamm,
  testEinheit,
  testId,
  testKiste,
  testLager,
} from '../testing/aufbau-testdaten';
import {
  alleEinheiten,
  artikelHinzufuegen,
  eintragAendern,
  eintragEntfernen,
  einheitAendern,
  einheitEntfernen,
  einheitHinzufuegen,
  findeEinheit,
  freieKisteHinzufuegen,
  freiePositionVerknuepfen,
  freienArtikelVerknuepfen,
  freienArtikelHinzufuegen,
  kisteAbgleichen,
  verschiebeImBaum,
  type BaumOrt,
  kisteHinzufuegen,
  kistePositionAendern,
  kistePositionEntfernen,
  kistePositionHinzufuegen,
  mitNeuenIds,
  naechsteFarbe,
  zaehleAufbauInhalt,
} from './aufbau-bearbeiten';
import type { AufbauEinheit } from '../models/aufbau.model';
import { istAufbauInhalt } from './aufbau-pruefung';

const lager = testLager(1, 'Halle A', 1);
const wasser = testArtikelStamm(11, 'Trinkwasser', 'Liter', lager.id);
const kiste = testKiste(21, 'Verbandkiste', lager.id, wasser.id);

describe('Aufbau bearbeiten', () => {
  it('fügt Einheiten mit der nächsten freien Farbe hinzu und ordnet einen Wagen dem Fahrzeug zu', () => {
    let inhalt = testAufbauInhalt([]);
    const f = einheitHinzufuegen(inhalt, 'fahrzeug', 'GW-San 1');
    inhalt = f.inhalt;
    const w = einheitHinzufuegen(inhalt, 'wagen', 'Rollwagen', f.id);
    inhalt = w.inhalt;
    const z = einheitHinzufuegen(inhalt, 'wagen', '  ');
    inhalt = z.inhalt;
    expect(inhalt.einheiten.map((e) => [e.name, e.farbe])).toEqual([
      ['GW-San 1', 'abschnitt-1'],
      ['Wagen', 'abschnitt-2'],
    ]);
    expect(alleEinheiten(inhalt).map((e) => e.name)).toEqual(['GW-San 1', 'Rollwagen', 'Wagen']);
    expect(findeEinheit(inhalt, w.id)?.name).toBe('Rollwagen');
    expect(istAufbauInhalt(inhalt)).toBe(true);
  });

  it('wählt reihum eine Farbe, wenn alle acht belegt sind', () => {
    const acht = testAufbauInhalt(
      Array.from({ length: 8 }, (_, i) => testEinheit({ farbe: `abschnitt-${i + 1}` as never })),
    );
    expect(naechsteFarbe(acht)).toBe('abschnitt-1');
  });

  it('kopiert eine Kiste als Momentaufnahme und begrenzt die Anzahl', () => {
    const e = testEinheit();
    let inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, kiste, 500);
    const eintrag = inhalt.einheiten[0]!.inhalt[0]!;
    expect(eintrag).toMatchObject({
      art: 'kiste',
      kisteId: kiste.id,
      name: 'Verbandkiste',
      anzahl: 99,
    });
    // Änderung an den Stammdaten wirkt nicht zurück (eigene Kopie des Inhalts).
    kiste.inhalt[0]!.menge = 99;
    expect((eintrag as { inhalt: { menge: number }[] }).inhalt[0]!.menge).toBe(3);
    kiste.inhalt[0]!.menge = 3;
    inhalt = eintragAendern(inhalt, e.id, eintrag.id, { anzahl: 2 });
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({ anzahl: 2 });
  });

  it('fügt Artikel mit Heimatlager hinzu, ändert und entfernt Einträge', () => {
    const e = testEinheit();
    let inhalt = artikelHinzufuegen(testAufbauInhalt([e]), e.id, wasser, 85, '80–90');
    const eintrag = inhalt.einheiten[0]!.inhalt[0]!;
    expect(eintrag).toMatchObject({ art: 'artikel', lagerId: lager.id, menge: 85 });
    inhalt = eintragAendern(inhalt, e.id, eintrag.id, {
      menge: 90,
      lagerId: null,
      phase: 'vorher',
    });
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({
      menge: 90,
      lagerId: null,
      phase: 'vorher',
    });
    inhalt = eintragEntfernen(inhalt, e.id, eintrag.id);
    expect(inhalt.einheiten[0]!.inhalt).toEqual([]);
  });

  it('legt freie Artikel und freie Kisten ohne Stammdaten an', () => {
    const e = testEinheit();
    let inhalt = freienArtikelHinzufuegen(
      testAufbauInhalt([e]),
      e.id,
      '  Absperr  band ',
      'Rollen',
      4,
    );
    inhalt = freieKisteHinzufuegen(inhalt, e.id, 'Werkzeugkiste', 2);
    const [frei, leereKiste] = inhalt.einheiten[0]!.inhalt;
    expect(frei).toMatchObject({ art: 'frei', name: 'Absperr band', einheit: 'Rollen', menge: 4 });
    expect(leereKiste).toMatchObject({ art: 'kiste', kisteId: null, anzahl: 2, inhalt: [] });
    inhalt = eintragAendern(inhalt, e.id, frei!.id, { menge: 6, lagerId: null });
    expect(inhalt.einheiten[0]!.inhalt[0]).not.toHaveProperty('lagerId');
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({ menge: 6 });
    expect(istAufbauInhalt(inhalt)).toBe(true);
    expect(zaehleAufbauInhalt(inhalt)).toMatchObject({ kisten: 2, positionen: 1 });
  });

  it('befüllt eine freie Kiste mit freien und Katalog-Positionen', () => {
    const e = testEinheit();
    let inhalt = freieKisteHinzufuegen(testAufbauInhalt([e]), e.id, 'Werkzeug', 1);
    const kisteId = inhalt.einheiten[0]!.inhalt[0]!.id;
    const frei = { artikelId: null, name: 'Hammer', einheit: 'Stück', menge: 1, bemerkung: '' };
    inhalt = kistePositionHinzufuegen(inhalt, e.id, kisteId, frei);
    inhalt = kistePositionHinzufuegen(inhalt, e.id, kisteId, {
      artikelId: wasser.id,
      menge: 2,
      bemerkung: '',
    });
    inhalt = kistePositionHinzufuegen(inhalt, e.id, kisteId, {
      artikelId: wasser.id,
      menge: 3,
      bemerkung: '',
    });
    inhalt = kistePositionAendern(inhalt, e.id, kisteId, 0, { menge: 4 });
    const k = inhalt.einheiten[0]!.inhalt[0] as { inhalt: unknown[] };
    expect(k.inhalt).toEqual([
      { ...frei, menge: 4 },
      { artikelId: wasser.id, menge: 5, bemerkung: '' },
    ]);
    expect(istAufbauInhalt(inhalt)).toBe(true);
    inhalt = kistePositionEntfernen(inhalt, e.id, kisteId, 0);
    expect((inhalt.einheiten[0]!.inhalt[0] as { inhalt: unknown[] }).inhalt).toHaveLength(1);
  });

  it('verknüpft einen freien Artikel mit dem Katalog und behält Id, Menge und Phase', () => {
    const e = testEinheit();
    let inhalt = freienArtikelHinzufuegen(testAufbauInhalt([e]), e.id, 'Wasser', 'Liter', 7);
    const id = inhalt.einheiten[0]!.inhalt[0]!.id;
    inhalt = eintragAendern(inhalt, e.id, id, { phase: 'vorher', bemerkung: 'kalt' });
    inhalt = freienArtikelVerknuepfen(inhalt, e.id, id, wasser);
    expect(inhalt.einheiten[0]!.inhalt[0]).toEqual({
      art: 'artikel',
      id,
      artikelId: wasser.id,
      menge: 7,
      bemerkung: 'kalt',
      lagerId: lager.id,
      phase: 'vorher',
    });
    expect(istAufbauInhalt(inhalt)).toBe(true);
  });

  it('verknüpft eine freie Kistenposition; ein schon enthaltener Artikel addiert die Menge', () => {
    const e = testEinheit();
    let inhalt = freieKisteHinzufuegen(testAufbauInhalt([e]), e.id, 'Getränke', 1);
    const kisteId = inhalt.einheiten[0]!.inhalt[0]!.id;
    const frei = { artikelId: null, name: 'Wasser', einheit: 'Liter', menge: 2, bemerkung: '' };
    inhalt = kistePositionHinzufuegen(inhalt, e.id, kisteId, { ...frei });
    inhalt = freiePositionVerknuepfen(inhalt, e.id, kisteId, 0, wasser);
    const positionen = (inhalt.einheiten[0]!.inhalt[0] as { inhalt: unknown[] }).inhalt;
    expect(positionen).toEqual([{ artikelId: wasser.id, menge: 2, bemerkung: '' }]);
    inhalt = kistePositionHinzufuegen(inhalt, e.id, kisteId, { ...frei, menge: 3 });
    inhalt = freiePositionVerknuepfen(inhalt, e.id, kisteId, 1, wasser);
    expect((inhalt.einheiten[0]!.inhalt[0] as { inhalt: unknown[] }).inhalt).toEqual([
      { artikelId: wasser.id, menge: 5, bemerkung: '' },
    ]);
    expect(istAufbauInhalt(inhalt)).toBe(true);
  });

  it('benennt eine Kiste im Aufbau um, ohne Inhalt und Verweis zu ändern; leere Namen gelten nicht', () => {
    const e = testEinheit();
    let inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, kiste, 2);
    const id = inhalt.einheiten[0]!.inhalt[0]!.id;
    inhalt = eintragAendern(inhalt, e.id, id, { name: '  Verband   groß ' });
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({
      name: 'Verband groß',
      kisteId: kiste.id,
      anzahl: 2,
    });
    inhalt = eintragAendern(inhalt, e.id, id, { name: '   ' });
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({ name: 'Verband groß' });
    expect(istAufbauInhalt(inhalt)).toBe(true);
  });

  it('gleicht eine Kiste mit den Stammdaten ab', () => {
    const e = testEinheit();
    let inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, kiste);
    const id = inhalt.einheiten[0]!.inhalt[0]!.id;
    const neu = { ...kiste, name: 'Verbandkiste groß', inhalt: [] };
    inhalt = kisteAbgleichen(inhalt, e.id, id, neu);
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({ name: 'Verbandkiste groß', inhalt: [] });
  });

  it('ändert und entfernt Einheiten, auch Wagen im Fahrzeug, und entfernt das Foto', () => {
    const f = einheitHinzufuegen(testAufbauInhalt([]), 'fahrzeug', 'GW');
    const w = einheitHinzufuegen(f.inhalt, 'wagen', 'Rollwagen', f.id);
    let inhalt = einheitAendern(w.inhalt, w.id, {
      name: 'Wagen 2',
      foto: 'data:image/jpeg;base64,AAAA',
    });
    expect(findeEinheit(inhalt, w.id)).toMatchObject({
      name: 'Wagen 2',
      foto: 'data:image/jpeg;base64,AAAA',
    });
    inhalt = einheitAendern(inhalt, w.id, { foto: undefined });
    expect('foto' in findeEinheit(inhalt, w.id)!).toBe(false);
    inhalt = einheitEntfernen(inhalt, w.id);
    expect(alleEinheiten(inhalt).map((e) => e.name)).toEqual(['GW']);
    expect(einheitEntfernen(inhalt, f.id).einheiten).toEqual([]);
  });

  it('zählt wie der Worker', () => {
    const f = einheitHinzufuegen(testAufbauInhalt([]), 'fahrzeug', 'GW');
    const w = einheitHinzufuegen(f.inhalt, 'wagen', 'Rollwagen', f.id);
    let inhalt = kisteHinzufuegen(w.inhalt, w.id, kiste, 2);
    inhalt = artikelHinzufuegen(inhalt, f.id, wasser);
    expect(zaehleAufbauInhalt(inhalt)).toEqual({ einheiten: 2, kisten: 2, positionen: 2 });
  });

  it('kopiert mit durchweg neuen Ids', () => {
    const e = testEinheit();
    let inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, kiste);
    inhalt = artikelHinzufuegen(inhalt, e.id, wasser);
    const kopie = mitNeuenIds(inhalt);
    const ids = (i: typeof inhalt) =>
      alleEinheiten(i).flatMap((x) => [x.id, ...x.inhalt.map((y) => y.id)]);
    expect(ids(kopie)).toHaveLength(3);
    expect(ids(kopie).filter((id) => ids(inhalt).includes(id))).toEqual([]);
    expect(kopie.einheiten[0]!.inhalt[0]).toMatchObject({ art: 'kiste', kisteId: kiste.id });
    expect(istAufbauInhalt(kopie)).toBe(true);
    expect(testId(1)).toBe(lager.id);
  });
});

describe('verschiebeImBaum', () => {
  const kisteEintrag = (name: string) => ({
    art: 'kiste' as const,
    id: crypto.randomUUID(),
    kisteId: null,
    name,
    lagerId: null,
    anzahl: 1,
    inhalt: [],
    phase: null,
  });
  const ort = (
    art: BaumOrt['art'],
    id: string,
    einheitId: string,
    wurzelId: string,
    tiefe: BaumOrt['tiefe'],
  ): BaumOrt => ({
    art,
    id,
    einheitId,
    wurzelId,
    tiefe,
  });

  function aufbau() {
    const k1 = kisteEintrag('K1');
    const k2 = kisteEintrag('K2');
    const kw = kisteEintrag('KW');
    const wagen1 = testEinheit({ name: 'Wagen 1', inhalt: [kw] });
    const wagen2 = testEinheit({ name: 'Wagen 2' });
    const f1 = testEinheit({
      typ: 'fahrzeug',
      name: 'F1',
      inhalt: [k1, k2, { art: 'wagen', id: crypto.randomUUID(), einheit: wagen1 }],
    });
    const f2 = testEinheit({
      typ: 'fahrzeug',
      name: 'F2',
      inhalt: [{ art: 'wagen', id: crypto.randomUUID(), einheit: wagen2 }],
    });
    const frei = testEinheit({ name: 'Frei' });
    return { inhalt: testAufbauInhalt([f1, f2, frei]), k1, k2, kw, wagen1, wagen2, f1, f2, frei };
  }
  const namen = (e: AufbauEinheit) =>
    e.inhalt.map((x) => (x.art === 'wagen' ? `W:${x.einheit.name}` : 'name' in x ? x.name : '?'));

  it('verschiebt eine Kiste in einen Wagen und hinter eine andere Kiste', () => {
    const a = aufbau();
    // k1 in Wagen 2 (Anker: Zeile Wagen 2, also an den Anfang des Wagens)
    let neu = verschiebeImBaum(
      a.inhalt,
      ort('kiste', a.k1.id, a.f1.id, a.f1.id, 1),
      ort('einheit', a.wagen2.id, a.wagen2.id, a.f2.id, 1),
    );
    expect(namen(neu.einheiten[0]!)).toEqual(['K2', 'W:Wagen 1']);
    expect(namen(alleEinheiten(neu).find((e) => e.id === a.wagen2.id)!)).toEqual(['K1']);
    // k2 hinter die Kiste im Wagen 1 (Anker: Kiste KW)
    neu = verschiebeImBaum(
      a.inhalt,
      ort('kiste', a.k2.id, a.f1.id, a.f1.id, 1),
      ort('kiste', a.kw.id, a.wagen1.id, a.f1.id, 2),
    );
    expect(namen(alleEinheiten(neu).find((e) => e.id === a.wagen1.id)!)).toEqual(['KW', 'K2']);
    expect(istAufbauInhalt(neu)).toBe(true);
  });

  it('ändert die Reihenfolge oberster Einheiten und nimmt den Inhalt mit', () => {
    const a = aufbau();
    const neu = verschiebeImBaum(
      a.inhalt,
      ort('einheit', a.frei.id, a.frei.id, a.frei.id, 0),
      ort('einheit', a.f1.id, a.f1.id, a.f1.id, 0),
    );
    expect(neu.einheiten.map((e) => e.name)).toEqual(['F1', 'Frei', 'F2']);
    const nachVorn = verschiebeImBaum(a.inhalt, ort('einheit', a.f2.id, a.f2.id, a.f2.id, 0), null);
    expect(nachVorn.einheiten.map((e) => e.name)).toEqual(['F2', 'F1', 'Frei']);
    expect(namen(nachVorn.einheiten[0]!)).toEqual(['W:Wagen 2']);
    // Ablegen hinter einer eigenen Kiste ändert nichts.
    expect(
      verschiebeImBaum(
        a.inhalt,
        ort('einheit', a.f1.id, a.f1.id, a.f1.id, 0),
        ort('kiste', a.k1.id, a.f1.id, a.f1.id, 1),
      ),
    ).toBe(a.inhalt);
  });

  it('setzt einen Wagen in ein anderes Fahrzeug, aber nie in einen freien Wagen', () => {
    const a = aufbau();
    const neu = verschiebeImBaum(
      a.inhalt,
      ort('einheit', a.wagen1.id, a.f1.id, a.f1.id, 1),
      ort('einheit', a.f2.id, a.f2.id, a.f2.id, 0),
    );
    expect(namen(neu.einheiten[0]!)).toEqual(['K1', 'K2']);
    expect(namen(neu.einheiten[1]!)).toEqual(['W:Wagen 1', 'W:Wagen 2']);
    expect(
      verschiebeImBaum(
        a.inhalt,
        ort('einheit', a.wagen1.id, a.f1.id, a.f1.id, 1),
        ort('einheit', a.frei.id, a.frei.id, a.frei.id, 0),
      ),
    ).toBe(a.inhalt);
    expect(istAufbauInhalt(neu)).toBe(true);
  });
});
