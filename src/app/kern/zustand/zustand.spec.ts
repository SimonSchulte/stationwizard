import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Leerzustand } from './leerzustand';
import { Meldung } from './meldung';

@Component({
  imports: [Meldung, Leerzustand],
  template: `
    <app-meldung art="fehler">Kaputt<button meldungAktion>Erneut</button></app-meldung>
    <app-meldung art="erfolg">Gespeichert</app-meldung>
    <app-leerzustand icon="task_alt" titel="Keine Aufgaben">Erklärung</app-leerzustand>
  `,
})
class Gastgeber {}

describe('Zustandsbausteine', () => {
  it('sagt Fehler als alert und Erfolg als status an und projiziert die Aktion', () => {
    const fixture = TestBed.createComponent(Gastgeber);
    fixture.detectChanges();
    const [fehler, erfolg] = (fixture.nativeElement as HTMLElement).querySelectorAll('app-meldung');
    expect(fehler!.getAttribute('role')).toBe('alert');
    expect(fehler!.classList).toContain('art-fehler');
    expect(fehler!.querySelector('.aktion button')?.textContent).toBe('Erneut');
    expect(erfolg!.getAttribute('role')).toBe('status');
  });

  it('zeigt im Leerzustand Titel und Erklärung', () => {
    const fixture = TestBed.createComponent(Gastgeber);
    fixture.detectChanges();
    const leer = (fixture.nativeElement as HTMLElement).querySelector('app-leerzustand')!;
    expect(leer.querySelector('.titel')?.textContent).toBe('Keine Aufgaben');
    expect(leer.querySelector('.erklaerung')?.textContent).toBe('Erklärung');
  });
});
