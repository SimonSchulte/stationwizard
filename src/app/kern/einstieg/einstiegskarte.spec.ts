import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Einstiegskarte } from './einstiegskarte';

@Component({
  imports: [Einstiegskarte],
  template: `
    <app-einstiegskarte ziel="/ziel" icon="home" titel="Link" aktion="Öffnen"
      >Text A</app-einstiegskarte
    >
    <app-einstiegskarte
      icon="print"
      titel="Knopf"
      aktion="Drucken"
      [laedt]="laedt()"
      [deaktiviert]="laedt()"
      (aktiviert)="klicks = klicks + 1"
      >Text B</app-einstiegskarte
    >
  `,
})
class Gastgeber {
  readonly laedt = signal(false);
  klicks = 0;
}

describe('Einstiegskarte', () => {
  function aufbauen() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Gastgeber);
    fixture.detectChanges();
    return fixture;
  }

  it('ist mit Ziel ein Link und ohne Ziel ein Knopf', () => {
    const wurzel: HTMLElement = aufbauen().nativeElement;
    expect(wurzel.querySelector('a.karte')?.getAttribute('href')).toBe('/ziel');
    expect(wurzel.querySelectorAll('button.karte')).toHaveLength(1);
    expect(wurzel.textContent).toContain('Text A');
    expect(wurzel.textContent).toContain('Text B');
  });

  it('meldet den Klick und sperrt sich während des Ladens', () => {
    const fixture = aufbauen();
    const knopf = fixture.nativeElement.querySelector('button.karte') as HTMLButtonElement;
    knopf.click();
    expect(fixture.componentInstance.klicks).toBe(1);
    fixture.componentInstance.laedt.set(true);
    fixture.detectChanges();
    expect(knopf.disabled).toBe(true);
    expect(knopf.textContent).toContain('Wird erstellt');
  });
});
