import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { leererTermin } from '../../models/plan.model';
import { TerminKarte } from './termin-karte';

function karte(bearbeitbar = true) {
  const fixture = TestBed.createComponent(TerminKarte);
  fixture.componentRef.setInput('termin', { ...leererTermin('2026-05-05'), thema: 'Funk' });
  fixture.componentRef.setInput('bearbeitbar', bearbeitbar);
  const bearbeiten = vi.fn();
  fixture.componentInstance.bearbeiten.subscribe(bearbeiten);
  fixture.detectChanges();
  return { fixture, bearbeiten, host: fixture.nativeElement as HTMLElement };
}

describe('TerminKarte', () => {
  it('öffnet den Termin per Klick und per Enter auf die Karte', () => {
    const { host, bearbeiten } = karte();
    expect(host.getAttribute('tabindex')).toBe('0');
    host.querySelector<HTMLElement>('.titel')!.click();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(bearbeiten).toHaveBeenCalledTimes(2);
  });

  it('löst über den Menüknopf keine Bearbeitung aus', () => {
    const { host, bearbeiten } = karte();
    host.querySelector<HTMLElement>('.menue-knopf')!.click();
    expect(bearbeiten).not.toHaveBeenCalled();
  });

  it('bleibt eine reine Anzeige, wenn sie nicht bearbeitbar ist', () => {
    const { host, bearbeiten } = karte(false);
    expect(host.hasAttribute('tabindex')).toBe(false);
    host.click();
    expect(bearbeiten).not.toHaveBeenCalled();
  });
});
