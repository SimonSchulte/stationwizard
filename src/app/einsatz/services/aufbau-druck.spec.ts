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
import { aufbauAlsDruckInhalt, AufbauDruckDienst, sollInhaltZeilen } from './aufbau-druck';
import {
  artikelHinzufuegen,
  einheitAendern,
  einheitHinzufuegen,
  kisteHinzufuegen,
} from './aufbau-bearbeiten';
import { abschnittFarbeHex } from './zettel-pdf-definition';
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

describe('Aushang je Einheit und Packzettel je Kiste', () => {
  it('liefert einen Aushang je Fahrzeug und je Wagen mit Soll-Inhalt in der Farbe des Fahrzeugs', () => {
    const { inhalt, fahrzeugId, wagenId } = beispiel();
    const druck = aufbauAlsDruckInhalt(inhalt, DATEN);
    expect(druck.schilder?.map((s) => [s.id, s.titel, s.farbe])).toEqual([
      [fahrzeugId, 'GW-San 1', 'abschnitt-1'],
      [wagenId, 'Rollwagen 03', 'abschnitt-1'],
    ]);
    expect(druck.schilder?.[0]?.zeilen).toEqual(['Wagen: Rollwagen 03']);
    expect(druck.schilder?.[1]?.zeilen).toEqual([
      '2× Verbandkiste',
      '85 Liter Trinkwasser (80–90)',
    ]);
    expect(druck.schilder?.[0]?.foto).toBe('data:image/jpeg;base64,AAAA');
  });

  it('liefert einen Packzettel je physischer Kiste', () => {
    const { inhalt, wagenId } = beispiel();
    const kisten = aufbauAlsDruckInhalt(inhalt, DATEN).kistenzettel!;
    expect(kisten).toHaveLength(1);
    expect(kisten[0]!.laufzettel.map((l) => [l.ueberschrift, l.transportMit])).toEqual([
      ['Verbandkiste packen', 'Rollwagen 03 (in GW-San 1)'],
      ['Verbandkiste packen', 'Rollwagen 03 (in GW-San 1)'],
    ]);
    expect(wagenId).toBeTruthy();
  });

  it('liefert ein Kistenschild je physischer Kiste mit Inhalt, Heimatlager und Zielfarbe', () => {
    const { inhalt } = beispiel();
    const schilder = aufbauAlsDruckInhalt(inhalt, DATEN).kistenschilder!;
    expect(schilder).toHaveLength(2);
    expect(schilder[0]).toMatchObject({
      titel: 'Verbandkiste',
      heimatlager: 'Medizinlager',
      zeilen: ['3 Liter Trinkwasser'],
    });
    expect(schilder[0]!.rahmenFarbe).toMatch(/^#/);
  });

  it('lässt Aushang und Packzettel ohne Einträge weg und nennt freie Artikel', () => {
    const e = testEinheit();
    const leer = aufbauAlsDruckInhalt(testAufbauInhalt([e]), DATEN);
    expect(leer.kistenzettel).toBeUndefined();
    expect(leer.kistenschilder).toBeUndefined();
    expect(leer.schilder).toHaveLength(1);
    expect(sollInhaltZeilen({ ...e, inhalt: [] }, DATEN)).toEqual([]);
    const frei = {
      art: 'frei' as const,
      id: 'x',
      name: 'Absperrband',
      einheit: 'Rollen',
      menge: 4,
      bemerkung: '',
      phase: null,
    };
    expect(sollInhaltZeilen({ ...e, inhalt: [frei] }, DATEN)).toEqual(['4 Rollen Absperrband']);
  });
});

describe('aufbauAlsDruckInhalt', () => {
  it('macht aus jedem Fahrzeug und jedem Wagen einen Abschnitt mit eigener Farbe und aus jedem Zettel einen Laufzettel', () => {
    const { inhalt, fahrzeugId, wagenId } = beispiel();
    const vb = aufbauAlsDruckInhalt(inhalt, DATEN);
    expect(vb.anweisungen).toBe('Zuerst Halle A');
    expect(vb.abschnitte).toHaveLength(2);
    expect(vb.abschnitte[0]).toMatchObject({
      id: fahrzeugId,
      titel: 'GW-San 1',
      farbe: 'abschnitt-1',
      foto: 'data:image/jpeg;base64,AAAA',
    });
    expect(vb.abschnitte[1]).toMatchObject({ id: wagenId, titel: 'Rollwagen 03' });
    expect(vb.abschnitte.map((a) => a.laufzettel.map((l) => [l.id, l.transportMit]))).toEqual([
      [[fahrzeugId, 'GW-San 1']],
      [[wagenId, 'Rollwagen 03 (in GW-San 1)']],
    ]);
  });

  it('übersetzt Lagertrenner in Hinweiszeilen und Zeilen in Anzahl und Text', () => {
    const { inhalt, wagenId } = beispiel();
    const wagen = aufbauAlsDruckInhalt(inhalt, DATEN)
      .abschnitte.flatMap((a) => a.laufzettel)
      .find((l) => l.id === wagenId)!;
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

  it('trägt die eigene Farbe eines Wagens durch Laufzettel, Aushang, Packzettel und Kistenschild', () => {
    const { inhalt, wagenId } = beispiel();
    const mitFarbe = einheitAendern(inhalt, wagenId, { farbe: 'abschnitt-3' });
    const druck = aufbauAlsDruckInhalt(mitFarbe, DATEN);
    expect(druck.abschnitte.map((a) => a.farbe)).toEqual(['abschnitt-1', 'abschnitt-3']);
    expect(druck.schilder?.map((s) => s.farbe)).toEqual(['abschnitt-1', 'abschnitt-3']);
    expect(druck.kistenzettel?.map((a) => a.farbe)).toEqual(['abschnitt-3']);
    expect(druck.kistenschilder?.[0]?.rahmenFarbe).toBe(abschnittFarbeHex('abschnitt-3'));
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
