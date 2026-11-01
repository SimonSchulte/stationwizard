import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MonatsNavigation } from './monats-navigation';

function erzeuge(monat: number | null) {
  const fixture = TestBed.createComponent(MonatsNavigation);
  fixture.componentRef.setInput('monat', monat);
  fixture.detectChanges();
  const gewaehlt: (number | null)[] = [];
  fixture.componentInstance.monatGewaehlt.subscribe((wert) => gewaehlt.push(wert));
  const knoepfe = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
  return { fixture, gewaehlt, zurueck: knoepfe[0]!, titel: knoepfe[1]!, weiter: knoepfe[2]! };
}

describe('MonatsNavigation', () => {
  it('zeigt den Monat und blättert innerhalb des Jahres', () => {
    const { gewaehlt, titel, weiter, zurueck } = erzeuge(4);
    expect(titel.textContent).toContain('Mai');
    weiter.click();
    zurueck.click();
    expect(gewaehlt).toEqual([5, 3]);
  });

  it('sperrt die Pfeile am Jahresrand und für das ganze Jahr', () => {
    expect(erzeuge(0).zurueck.disabled).toBe(true);
    expect(erzeuge(11).weiter.disabled).toBe(true);
    const ganz = erzeuge(null);
    expect(ganz.titel.textContent).toContain('Ganzes Jahr');
    expect(ganz.zurueck.disabled && ganz.weiter.disabled).toBe(true);
  });
});
