import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { testLaufzettel, testPosition } from '../../testing/vb-testdaten';
import { VbLaufzettel } from '../../models/vb.model';
import { LaufzettelMarke, LaufzettelKarte } from './laufzettel-karte';

function erzeuge(
  laufzettel: VbLaufzettel,
  optionen: { ausgewaehlt?: boolean; marke?: LaufzettelMarke | null; abschnittTitel?: string } = {},
) {
  const fixture = TestBed.createComponent(LaufzettelKarte);
  fixture.componentRef.setInput('laufzettel', laufzettel);
  fixture.componentRef.setInput('nummer', 3);
  fixture.componentRef.setInput('farbe', 'abschnitt-2');
  fixture.componentRef.setInput('ausgewaehlt', optionen.ausgewaehlt ?? false);
  fixture.componentRef.setInput('marke', optionen.marke ?? null);
  fixture.componentRef.setInput('abschnittTitel', optionen.abschnittTitel ?? '');
  fixture.detectChanges();
  return fixture;
}

describe('LaufzettelKarte', () => {
  it('zeigt „Lager → Ziel“ und setzt das Ziel grau, solange es nur der Abschnitt ist', () => {
    const ohneEigenes = testLaufzettel({ lagerort: 'Lager Nord', transportMit: '' });
    const aus = erzeuge(ohneEigenes, { abschnittTitel: 'Rollwagen 01' }).nativeElement;
    expect(aus.querySelector('.lager')?.textContent).toBe('Lager Nord');
    expect(aus.querySelector('.ziel')?.textContent).toBe('Rollwagen 01');
    expect(aus.querySelector('.ziel')?.classList.contains('abgeleitet')).toBe(true);
    expect(aus.querySelector('.ort')?.getAttribute('aria-label')).toBe(
      'Von Lager Nord nach Rollwagen 01',
    );
    // ein Eintrag, der gleich dem Abschnitt lautet, gilt ebenfalls als abgeleitet
    const gleich = erzeuge(
      testLaufzettel({ lagerort: 'Lager Nord', transportMit: ' rollwagen 01 ' }),
      { abschnittTitel: 'Rollwagen 01' },
    ).nativeElement;
    expect(gleich.querySelector('.ziel')?.classList.contains('abgeleitet')).toBe(true);
    // ein eigenes Ziel hat Vorrang und steht nicht grau
    const eigenes = erzeuge(testLaufzettel({ lagerort: 'Lager Nord', transportMit: 'Sackkarre' }), {
      abschnittTitel: 'Rollwagen 01',
    }).nativeElement;
    expect(eigenes.querySelector('.ziel')?.textContent).toBe('Sackkarre');
    expect(eigenes.querySelector('.ziel')?.classList.contains('abgeleitet')).toBe(false);
  });

  it('zeigt Nummer, Materialien, Weg und Belegung, aber keine Fachgruppe', () => {
    const laufzettel = testLaufzettel({
      lagerort: 'Lager Nord',
      transportMit: 'Rollwagen',
      fachgruppe: 'betreuung',
      positionen: [testPosition({ material: 'Stühle' }), testPosition({ material: 'Tische' })],
    });
    const element = erzeuge(laufzettel).nativeElement as HTMLElement;
    expect(element.querySelector('.nummer')?.textContent).toBe('3');
    expect(element.querySelector('.kurztext')?.textContent).toBe('Stühle, Tische');
    expect(element.querySelector('.ort')?.textContent).toContain('Lager Nord');
    expect(element.querySelector('.ort')?.textContent).toContain('Rollwagen');
    expect(element.querySelector('app-fachgruppe-chip')).toBeNull();
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
    expect(element.querySelector('.lager')?.textContent).toBe('Kein Lager');
    expect(element.querySelector('.lager')?.classList.contains('fehlt')).toBe(true);
    expect(element.querySelector('.ziel')?.textContent).toBe('Kein Ziel');
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
