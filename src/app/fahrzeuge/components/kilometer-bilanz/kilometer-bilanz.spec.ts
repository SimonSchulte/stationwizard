import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { KilometerAmpel, KilometerJahresbilanz } from '../../services/kilometer-soll';
import { KilometerBilanz } from './kilometer-bilanz';

function bilanz(ueberschreibung: Partial<KilometerJahresbilanz> = {}): KilometerJahresbilanz {
  return {
    jahr: 2026,
    eigentuemer: 'bund',
    sollKm: 600,
    istKm: 300,
    restKm: 300,
    unvollstaendig: false,
    ...ueberschreibung,
  };
}

function erzeugeFixture(wert: KilometerJahresbilanz, ampel: KilometerAmpel | null = null) {
  const fixture = TestBed.createComponent(KilometerBilanz);
  fixture.componentRef.setInput('bilanz', wert);
  fixture.componentRef.setInput('ampel', ampel);
  fixture.detectChanges();
  return fixture;
}

function erzeuge(wert: KilometerJahresbilanz): KilometerBilanz {
  return erzeugeFixture(wert).componentInstance;
}

describe('KilometerBilanz', () => {
  it('berechnet den Fortschritt in Prozent, gerundet', () => {
    const komponente = erzeuge(bilanz({ sollKm: 600, istKm: 150 }));
    expect(komponente.fortschrittProzent()).toBe(25);
  });

  it('deckelt den Fortschritt bei 100 %, auch weit über dem Soll', () => {
    const komponente = erzeuge(bilanz({ sollKm: 600, istKm: 3000, restKm: 0 }));
    expect(komponente.fortschrittProzent()).toBe(100);
  });

  it('zeigt 0 % ohne Mindestlaufleistung oder ohne Startstand', () => {
    expect(erzeuge(bilanz({ sollKm: 0, istKm: null, restKm: null })).fortschrittProzent()).toBe(0);
    expect(erzeuge(bilanz({ istKm: null, restKm: null })).fortschrittProzent()).toBe(0);
  });

  it('erkennt ein erreichtes Jahresziel am Restwert', () => {
    expect(erzeuge(bilanz({ restKm: 0 })).zielErreicht()).toBe(true);
    expect(erzeuge(bilanz({ restKm: 50 })).zielErreicht()).toBe(false);
    expect(erzeuge(bilanz({ restKm: null })).zielErreicht()).toBe(false);
  });

  it('zeigt ohne Ampel-Eingabe keinen Ampelpunkt', () => {
    const fixture = erzeugeFixture(bilanz());
    expect(fixture.nativeElement.querySelector('.ampel-punkt')).toBeNull();
  });

  it.each([
    ['gruen', 'ampel-gruen'],
    ['gelb', 'ampel-gelb'],
    ['rot', 'ampel-rot'],
  ] as const)('rendert einen Ampelpunkt mit Klasse %s → %s', (farbe, klasse) => {
    const fixture = erzeugeFixture(bilanz(), farbe);
    const punkt = fixture.nativeElement.querySelector('.ampel-punkt');
    expect(punkt).not.toBeNull();
    expect(punkt.classList.contains(klasse)).toBe(true);
  });
});
