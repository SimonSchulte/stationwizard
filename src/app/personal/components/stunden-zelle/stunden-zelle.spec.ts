import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StundenZelle } from './stunden-zelle';

function erzeuge(manuell: number | null, stand: number | null) {
  const fixture = TestBed.createComponent(StundenZelle);
  fixture.componentRef.setInput('person', 'Muster');
  fixture.componentRef.setInput('importiert', 100);
  fixture.componentRef.setInput('wirksam', Math.max(100, manuell ?? 0));
  fixture.componentRef.setInput('manuell', manuell);
  fixture.componentRef.setInput('stand', stand);
  fixture.detectChanges();
  return fixture;
}

describe('StundenZelle', () => {
  it('verwirft eine unlesbare Stundenzahl und meldet den Grund', () => {
    const fixture = erzeuge(null, null);
    const fehler: string[] = [];
    const gemeldet: (number | null)[] = [];
    fixture.componentInstance.fehler.subscribe((text) => fehler.push(text));
    fixture.componentInstance.manuellGeaendert.subscribe((wert) => gemeldet.push(wert));
    const feld = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    feld.value = 'viele';
    feld.dispatchEvent(new Event('change'));
    expect(gemeldet).toEqual([]);
    expect(fehler[0]).toContain('nicht lesbar');
    expect(feld.value).toBe('');

    feld.value = '1.250,5';
    feld.dispatchEvent(new Event('change'));
    expect(gemeldet).toEqual([1250.5]);
  });

  it('verlangt zum Nachtrag einen Stand', () => {
    const element = erzeuge(150, null).nativeElement as HTMLElement;
    expect(element.querySelector('.jahr-fehlt')).not.toBeNull();
    expect(element.querySelector('.quelle')?.classList.contains('zaehlt')).toBe(false);
  });
});
