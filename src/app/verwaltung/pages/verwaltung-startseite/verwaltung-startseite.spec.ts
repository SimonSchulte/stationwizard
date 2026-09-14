import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { VerwaltungStartseite } from './verwaltung-startseite';

describe('Verwaltungs-Startseite', () => {
  it('verweist auf den Fahrzeugimport', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(VerwaltungStartseite);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const verweise = Array.from(element.querySelectorAll('a.aufgabe'));
    expect(verweise.map((verweis) => verweis.getAttribute('href'))).toContain(
      '/verwaltung/fahrzeuge-import',
    );
  });
});
