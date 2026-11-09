import { describe, expect, it } from 'vitest';
import { harterUmbruch } from './text-umbruch';

const OHNE = (text: string) => text.replaceAll('​', '');

describe('harterUmbruch', () => {
  it('lässt kurze Wörter und Text unverändert', () => {
    expect(harterUmbruch('Grill - Propan mit Gas', 13)).toBe('Grill - Propan mit Gas');
  });

  it('setzt in zu langen Wörtern zwischen alle Zeichen eine Umbruchstelle', () => {
    const ergebnis = harterUmbruch('Rechteckpfanneneinsatz', 13);
    expect(OHNE(ergebnis)).toBe('Rechteckpfanneneinsatz');
    expect(ergebnis.split('​')).toHaveLength('Rechteckpfanneneinsatz'.length);
  });

  it('trennt zuerst an Bindestrich und Schrägstrich und bricht nur zu lange Stücke', () => {
    const ergebnis = harterUmbruch('Edelstahl-Gastro/Schalen Betreuungsanhänger', 13);
    expect(OHNE(ergebnis)).toBe('Edelstahl-Gastro/Schalen Betreuungsanhänger');
    expect(ergebnis.startsWith('Edelstahl-Gastro/Schalen ')).toBe(true);
    expect(ergebnis).toContain('B​e​t');
  });

  it('zählt Umlaute und Sonderzeichen als je ein Zeichen', () => {
    expect(harterUmbruch('ÄÖÜäöü', 6)).toBe('ÄÖÜäöü');
    expect(harterUmbruch('ÄÖÜäöüß', 6)).toBe('Ä​Ö​Ü​ä​ö​ü​ß');
  });
});
