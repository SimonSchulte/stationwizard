import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { testLaufzettel, testPosition } from '../../testing/vb-testdaten';
import { VbLaufzettel } from '../../models/vb.model';
import { LaufzettelMarke, LaufzettelKarte } from './laufzettel-karte';

function erzeuge(
  laufzettel: VbLaufzettel,
  optionen: { ausgewaehlt?: boolean; marke?: LaufzettelMarke | null } = {},
) {
  const fixture = TestBed.createComponent(LaufzettelKarte);
  fixture.componentRef.setInput('laufzettel', laufzettel);
  fixture.componentRef.setInput('nummer', 3);
  fixture.componentRef.setInput('farbe', 'abschnitt-2');
  fixture.componentRef.setInput('ausgewaehlt', optionen.ausgewaehlt ?? false);
  fixture.componentRef.setInput('marke', optionen.marke ?? null);
  fixture.detectChanges();
  return fixture;
}

describe('LaufzettelKarte', () => {
  it('zeigt Nummer, Materialien, Ort, Fachgruppe und Belegung', () => {
    const laufzettel = testLaufzettel({
      lagerort: 'Lager Nord',
      transportMit: 'Rollwagen',
      positionen: [testPosition({ material: 'Stühle' }), testPosition({ material: 'Tische' })],
    });
    const element = erzeuge(laufzettel).nativeElement as HTMLElement;
    expect(element.querySelector('.nummer')?.textContent).toBe('3');
    expect(element.querySelector('.kurztext')?.textContent).toBe('Stühle, Tische');
    expect(element.querySelector('.ort')?.textContent).toBe('Von Lager Nord → Auf/In Rollwagen');
    expect(element.querySelector('app-fachgruppe-chip')?.textContent).toContain('Betreuung');
    expect(element.querySelector('.platz')?.textContent).toContain('2 / 23');
    expect(element.querySelector('.streifen')).not.toBeNull();
    expect(element.querySelector<HTMLElement>('.karte')!.style.getPropertyValue('--streifen')).toBe(
      'var(--abschnitt-2)',
    );
  });

  it('markiert einen zu vollen Laufzettel mit Zustand und Symbol', () => {
    const positionen = Array.from({ length: 24 }, () => testPosition({ material: 'Kabel' }));
    const element = erzeuge(testLaufzettel({ positionen })).nativeElement as HTMLElement;
    const platz = element.querySelector('.platz')!;
    expect(platz.getAttribute('data-zustand')).toBe('zu-voll');
    expect(platz.querySelector('mat-icon')).not.toBeNull();
    expect(platz.getAttribute('aria-label')).toContain('passt nicht');
  });

  it('kennt Marke, Auswahl und leere Angaben', () => {
    const laufzettel = testLaufzettel({
      lagerort: '',
      transportMit: '',
      fachgruppe: null,
      positionen: [],
    });
    const element = erzeuge(laufzettel, { ausgewaehlt: true, marke: 'neu' })
      .nativeElement as HTMLElement;
    expect(element.querySelector('.marke')?.textContent).toBe('neu');
    expect(element.querySelector('.karte')?.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.kurztext')?.textContent).toBe('Keine Positionen');
    expect(element.querySelector('.ort')?.textContent).toBe('Kein Ziel angegeben');
    expect(element.querySelector('app-fachgruppe-chip')).toBeNull();
  });

  it('meldet Klick und Tastatur als gewählt', () => {
    const fixture = erzeuge(testLaufzettel());
    let anzahl = 0;
    fixture.componentInstance.gewaehlt.subscribe(() => (anzahl += 1));
    const karte = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.karte')!;
    karte.click();
    karte.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    karte.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(anzahl).toBe(3);
  });
});
