import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { KilometerBilanz } from './kilometer-bilanz';
import { KilometerJahresbilanz } from '../../services/kilometer-soll';

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

function erzeuge(wert: KilometerJahresbilanz): KilometerBilanz {
  const fixture = TestBed.createComponent(KilometerBilanz);
  fixture.componentRef.setInput('bilanz', wert);
  fixture.detectChanges();
  return fixture.componentInstance;
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
});
