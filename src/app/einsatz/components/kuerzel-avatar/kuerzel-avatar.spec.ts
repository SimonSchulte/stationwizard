import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { KuerzelAvatar } from './kuerzel-avatar';

function erzeuge(name: string, kuerzel?: string | null): HTMLElement {
  const fixture = TestBed.createComponent(KuerzelAvatar);
  fixture.componentRef.setInput('name', name);
  fixture.componentRef.setInput('kuerzel', kuerzel);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('KuerzelAvatar', () => {
  it('zeigt das Benutzerkürzel und ist für Screenreader versteckt', () => {
    const element = erzeuge('Muster Anna', 'MUA');
    expect(element.textContent?.trim()).toBe('MUA');
    expect(element.getAttribute('aria-hidden')).toBe('true');
  });

  it('fällt ohne Kürzel auf die Initialen zurück', () => {
    expect(erzeuge('Muster Anna').textContent?.trim()).toBe('MA');
  });
});
