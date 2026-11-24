import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AmpelChip, AmpelFarbe } from './ampel-chip';

function rendere(farbe: AmpelFarbe, text: string): HTMLElement {
  const fixture = TestBed.createComponent(AmpelChip);
  fixture.componentRef.setInput('farbe', farbe);
  fixture.componentRef.setInput('text', text);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AmpelChip', () => {
  it.each([
    ['rot', 'error'],
    ['gelb', 'warning'],
    ['gruen', 'check_circle'],
    ['neutral', 'schedule'],
  ] as const)('zeigt für %s das Symbol %s zusätzlich zum Text', (farbe, symbol) => {
    const element = rendere(farbe, 'HU in 23 Tagen');
    expect(element.querySelector('mat-icon')?.textContent?.trim()).toBe(symbol);
    expect(element.querySelector('.chip-text')?.textContent?.trim()).toBe('HU in 23 Tagen');
    expect(element.querySelector('.chip')?.classList.contains(`chip--${farbe}`)).toBe(true);
  });

  it('verbirgt das Symbol vor Screenreadern, der Text trägt die Aussage', () => {
    const element = rendere('rot', 'HU überfällig');
    expect(element.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
