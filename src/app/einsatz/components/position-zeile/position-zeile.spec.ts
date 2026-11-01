import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Einsatzkraft, Position } from '../../models/planung.model';
import { PositionZeile } from './position-zeile';

function position(ueberschreibung: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    label: 'Truppführer',
    requirements: { taktisch: 'GF', medizinisch: 'RS' },
    assigned: null,
    ...ueberschreibung,
  };
}

function erzeuge(pos: Position, besetzung: Einsatzkraft | null = null) {
  const fixture = TestBed.createComponent(PositionZeile);
  fixture.componentRef.setInput('position', pos);
  fixture.componentRef.setInput('postenId', 'posten-1');
  fixture.componentRef.setInput('besetzung', besetzung);
  fixture.componentRef.setInput('postenfuehrerSymbol', 'data:image/svg+xml,');
  fixture.detectChanges();
  return fixture;
}

describe('PositionZeile', () => {
  it('zeigt eine freie Position als nicht besetzt', () => {
    const element = erzeuge(position()).nativeElement as HTMLElement;
    expect(element.textContent).toContain('Nicht besetzt');
    expect(element.querySelector('.position-assigned')?.className).toContain('match-neutral');
  });

  it('bewertet die Besetzung gegen die Anforderungen', () => {
    const person: Einsatzkraft = {
      id: 'ek-1',
      name: 'Erfunden Erika',
      tags: { taktisch: ['GF'], medizinisch: ['RS'] },
    };
    const element = erzeuge(position({ assigned: { id: 'ek-1', name: person.name } }), person)
      .nativeElement as HTMLElement;
    expect(element.textContent).toContain('Erfunden Erika');
    expect(element.querySelector('.match-status-icon')?.textContent?.trim()).toBe('check_circle');
    expect(element.querySelector('.position-assigned')?.className).toContain('match-full');
  });

  it('meldet eine geänderte Bezeichnung beim Verlassen des Feldes', () => {
    const fixture = erzeuge(position());
    let gemeldet = '';
    fixture.componentInstance.bezeichnungGeaendert.subscribe((wert) => (gemeldet = wert));
    const feld = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    feld.value = 'Sanitäter';
    feld.dispatchEvent(new FocusEvent('blur'));
    expect(gemeldet).toBe('Sanitäter');
  });
});
