import { describe, expect, it } from 'vitest';
import {
  testAufbauInhalt,
  testArtikelStamm,
  testEinheit,
  testKiste,
  testLager,
} from '../testing/aufbau-testdaten';
import {
  eintragAendern,
  freieKisteHinzufuegen,
  kistePositionHinzufuegen,
  kisteHinzufuegen,
} from './aufbau-bearbeiten';
import {
  KEIN_SOLL_INHALT,
  STANDARD_INHALT,
  kistenzettelAusAufbau,
  schilderAusAufbau,
} from './aufbau-kistenschilder';
import { abschnittFarbeHex } from './zettel-pdf-definition';

const lager = testLager(1, 'Halle A', 1);
const wasser = testArtikelStamm(11, 'Trinkwasser', 'Liter', lager.id);
const stamm = testKiste(21, 'Verbandkiste', lager.id, wasser.id);
const daten = { lager: [lager], artikel: [wasser] };

describe('schilderAusAufbau', () => {
  it('druckt je Kiste und Anzahl ein Schild mit Inhalt aus dem Aufbau in der Zielfarbe', () => {
    const e = testEinheit();
    let inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, stamm, 2);
    inhalt = freieKisteHinzufuegen(inhalt, e.id, 'Werkzeug', 1);
    const freieId = inhalt.einheiten[0]!.inhalt[1]!.id;
    inhalt = kistePositionHinzufuegen(inhalt, e.id, freieId, {
      artikelId: null,
      name: 'Hammer',
      einheit: 'Stück',
      menge: 1,
      bemerkung: '',
    });
    const schilder = schilderAusAufbau(inhalt, daten);
    expect(schilder).toHaveLength(3);
    expect(schilder[0]).toMatchObject({
      titel: 'Verbandkiste',
      heimatlager: 'Halle A',
      zeilen: ['3 Liter Trinkwasser'],
      rahmenFarbe: abschnittFarbeHex(e.farbe),
    });
    expect(schilder[2]).toMatchObject({
      titel: 'Werkzeug',
      heimatlager: '',
      zeilen: ['1× Hammer'],
    });
  });
});

describe('kistenzettelAusAufbau', () => {
  it('macht je Kiste einen Laufzettel mit Zieleinheit und Heimatlager', () => {
    const e = testEinheit();
    let inhalt = kisteHinzufuegen(testAufbauInhalt([e]), e.id, stamm, 2);
    inhalt = freieKisteHinzufuegen(inhalt, e.id, 'Werkzeug', 1);
    const freieId = inhalt.einheiten[0]!.inhalt[1]!.id;
    inhalt = kistePositionHinzufuegen(inhalt, e.id, freieId, {
      artikelId: null,
      name: 'Hammer',
      einheit: 'Stück',
      menge: 1,
      bemerkung: 'groß',
    });
    const abschnitte = kistenzettelAusAufbau(inhalt, daten);
    expect(abschnitte).toHaveLength(1);
    expect(abschnitte[0]).toMatchObject({ titel: e.name, farbe: e.farbe });
    const zettel = abschnitte[0]!.laufzettel;
    expect(zettel).toHaveLength(3);
    expect(zettel[0]).toMatchObject({
      ueberschrift: 'Verbandkiste packen',
      lagerort: 'Halle A',
      transportMit: e.name,
    });
    expect(zettel[0]!.positionen[0]).toMatchObject({
      anzahl: '3',
      material: 'Trinkwasser (Liter)',
    });
    expect(zettel[2]!.positionen[0]).toMatchObject({ anzahl: '1', material: 'Hammer – groß' });
  });

  it('nennt bei einer Kiste ohne Inhalt ausdrücklich, dass kein Soll-Inhalt hinterlegt ist', () => {
    const e = testEinheit();
    const inhalt = freieKisteHinzufuegen(testAufbauInhalt([e]), e.id, 'TeSi Mat', 1);
    const positionen = kistenzettelAusAufbau(inhalt, daten)[0]!.laufzettel[0]!.positionen;
    expect(positionen).toHaveLength(1);
    expect(positionen[0]).toMatchObject({ hinweis: true, material: KEIN_SOLL_INHALT });
  });

  it('nennt bei einer Standard-Kiste die Standardbestückung statt eines fehlenden Soll-Inhalts', () => {
    const e = testEinheit();
    let inhalt = freieKisteHinzufuegen(testAufbauInhalt([e]), e.id, 'Hygiene 1', 1);
    const kisteId = inhalt.einheiten[0]!.inhalt[0]!.id;
    inhalt = eintragAendern(inhalt, e.id, kisteId, { standardInhalt: true });
    const positionen = kistenzettelAusAufbau(inhalt, daten)[0]!.laufzettel[0]!.positionen;
    expect(positionen).toHaveLength(1);
    expect(positionen[0]).toMatchObject({ hinweis: true, material: STANDARD_INHALT });
  });

  it('lässt Einheiten ohne Kiste aus', () => {
    expect(kistenzettelAusAufbau(testAufbauInhalt([testEinheit()]), daten)).toEqual([]);
  });
});
