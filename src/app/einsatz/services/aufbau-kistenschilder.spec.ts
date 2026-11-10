import { describe, expect, it } from 'vitest';
import {
  testAufbauInhalt,
  testArtikelStamm,
  testEinheit,
  testKiste,
  testLager,
} from '../testing/aufbau-testdaten';
import {
  freieKisteHinzufuegen,
  kistePositionHinzufuegen,
  kisteHinzufuegen,
} from './aufbau-bearbeiten';
import { schilderAusAufbau } from './aufbau-kistenschilder';
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
