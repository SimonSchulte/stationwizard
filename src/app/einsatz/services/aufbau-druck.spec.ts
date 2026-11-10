import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AufbauKistenEintrag } from '../models/aufbau.model';
import {
  testArtikelStamm,
  testAufbauInhalt,
  testEinheit,
  testKiste,
  testLager,
} from '../testing/aufbau-testdaten';
import { aufbauAlsDruckInhalt, AufbauDruckDienst } from './aufbau-druck';
import { artikelHinzufuegen, einheitHinzufuegen, kisteHinzufuegen } from './aufbau-bearbeiten';
import { ZettelDruckDienst } from './zettel-druck';

const halle = testLager(1, 'Halle A', 1);
const med = testLager(2, 'Medizinlager', 2);
const wasser = testArtikelStamm(11, 'Trinkwasser', 'Liter', halle.id);
const kiste = testKiste(21, 'Verbandkiste', med.id, wasser.id);
const DATEN = { lager: [halle, med], artikel: [wasser] };

function beispiel() {
  const f = einheitHinzufuegen(testAufbauInhalt([]), 'fahrzeug', 'GW-San 1');
  const w = einheitHinzufuegen(f.inhalt, 'wagen', 'Rollwagen 03', f.id);
  let inhalt = artikelHinzufuegen(w.inhalt, w.id, wasser, 85, '80–90');
  inhalt = kisteHinzufuegen(inhalt, w.id, kiste, 2);
  inhalt = {
    ...inhalt,
    anweisungen: 'Zuerst Halle A',
    einheiten: inhalt.einheiten.map((e) => ({ ...e, foto: 'data:image/jpeg;base64,AAAA' })),
  };
  return { inhalt, fahrzeugId: f.id, wagenId: w.id };
}

describe('aufbauAlsDruckInhalt', () => {
  it('macht aus jeder obersten Einheit einen Abschnitt mit Farbe und Foto und aus jedem Zettel einen Laufzettel', () => {
    const { inhalt, fahrzeugId, wagenId } = beispiel();
    const vb = aufbauAlsDruckInhalt(inhalt, DATEN);
    expect(vb.anweisungen).toBe('Zuerst Halle A');
    expect(vb.abschnitte).toHaveLength(1);
    const abschnitt = vb.abschnitte[0]!;
    expect(abschnitt).toMatchObject({
      id: fahrzeugId,
      titel: 'GW-San 1',
      farbe: 'abschnitt-1',
      foto: 'data:image/jpeg;base64,AAAA',
    });
    expect(abschnitt.laufzettel.map((l) => [l.id, l.ueberschrift, l.transportMit])).toEqual([
      [fahrzeugId, 'GW-San 1', 'GW-San 1'],
      [wagenId, 'Rollwagen 03', 'Rollwagen 03 (in GW-San 1)'],
    ]);
  });

  it('übersetzt Lagertrenner in Hinweiszeilen und Zeilen in Anzahl und Text', () => {
    const { inhalt, wagenId } = beispiel();
    const wagen = aufbauAlsDruckInhalt(inhalt, DATEN).abschnitte[0]!.laufzettel.find(
      (l) => l.id === wagenId,
    )!;
    expect(wagen.lagerort).toBe('Halle A');
    expect(wagen.positionen.map((p) => [p.hinweis === true, p.anzahl, p.material])).toEqual([
      [true, '', 'Halle A'],
      [false, '85', 'Trinkwasser · Liter (80–90)'],
      [true, '', 'Medizinlager'],
      [false, '2', 'Verbandkiste · 1 Pos.'],
    ]);
    const ids = wagen.positionen.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lässt einen Aufbau ohne Einheiten leer', () => {
    expect(aufbauAlsDruckInhalt(testAufbauInhalt([]), DATEN)).toEqual({
      anweisungen: '',
      abschnitte: [],
    });
  });

  it('kennt die Kiste nur als Momentaufnahme, nie aus den Stammdaten', () => {
    const e = testEinheit();
    const inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, kiste);
    const eintrag = inhalt.einheiten[0]!.inhalt[0] as AufbauKistenEintrag;
    expect(eintrag.name).toBe('Verbandkiste');
    const vb = aufbauAlsDruckInhalt(inhalt, { lager: [halle, med], artikel: [] });
    expect(vb.abschnitte[0]!.laufzettel[0]!.positionen.map((p) => p.material)).toEqual([
      'Medizinlager',
      'Verbandkiste · 1 Pos.',
    ]);
  });
});

describe('AufbauDruckDienst', () => {
  it('reicht die abgeleitete Vorbereitung an den vorhandenen Druck weiter', async () => {
    const zettelDruck = {
      drucken: vi.fn().mockResolvedValue(undefined),
      herunterladen: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ZettelDruckDienst, useValue: zettelDruck }],
    });
    const dienst = TestBed.inject(AufbauDruckDienst);
    const { inhalt } = beispiel();
    const kopf = { titel: 'Stadtfest', beginn: null, ende: null, ort: null };

    await dienst.drucken(kopf, inhalt, DATEN);
    await dienst.herunterladen(kopf, inhalt, DATEN);

    expect(zettelDruck.drucken).toHaveBeenCalledWith(kopf, aufbauAlsDruckInhalt(inhalt, DATEN));
    expect(zettelDruck.herunterladen).toHaveBeenCalledWith(
      kopf,
      aufbauAlsDruckInhalt(inhalt, DATEN),
    );
  });
});
