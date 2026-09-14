import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BenutzerZeile } from './benutzer-zeile';
import { Benutzerkonto } from '../../models/benutzerkonto.model';

function testkonto(ueberschreibung: Partial<Benutzerkonto> = {}): Benutzerkonto {
  return {
    email: 'person@example.test',
    rolle: null,
    sonderrollen: [],
    ersterZugriffAm: '2026-01-01T00:00:00.000Z',
    letzterZugriffAm: '2026-01-02T00:00:00.000Z',
    rolleGeaendertAm: null,
    rolleGeaendertVon: null,
    ...ueberschreibung,
  };
}

describe('BenutzerZeile', () => {
  it('leitet den Anzeigenamen aus der E-Mail-Adresse ab', () => {
    const fixture = TestBed.createComponent(BenutzerZeile);
    fixture.componentRef.setInput('konto', testkonto({ email: 'max.mustermann@juh-beispiel.de' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.anzeigename()).toBe('Max Mustermann');
  });

  it('übernimmt Rolle und Sonderrollen des Kontos als Entwurf, ohne Änderung', () => {
    const fixture = TestBed.createComponent(BenutzerZeile);
    fixture.componentRef.setInput(
      'konto',
      testkonto({ rolle: 'helfer', sonderrollen: ['verwaltungshelfer'] }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.entwurfRolle()).toBe('helfer');
    expect(fixture.componentInstance.entwurfSonderrollen()).toEqual(['verwaltungshelfer']);
    expect(fixture.componentInstance.hatAenderung()).toBe(false);
  });

  it('meldet eine Änderung erst, wenn sich der Entwurf vom Konto unterscheidet', () => {
    const fixture = TestBed.createComponent(BenutzerZeile);
    fixture.componentRef.setInput('konto', testkonto());
    fixture.detectChanges();

    fixture.componentInstance.hauptrolleAendern('zugfuehrung');
    expect(fixture.componentInstance.hatAenderung()).toBe(true);
  });

  it('setzt die Rolle über eine leere Auswahl auf null zurück', () => {
    const fixture = TestBed.createComponent(BenutzerZeile);
    fixture.componentRef.setInput('konto', testkonto({ rolle: 'helfer' }));
    fixture.detectChanges();

    fixture.componentInstance.hauptrolleAendern('');
    expect(fixture.componentInstance.entwurfRolle()).toBeNull();
  });

  it('ergänzt und entfernt eine Sonderrolle im Entwurf', () => {
    const fixture = TestBed.createComponent(BenutzerZeile);
    fixture.componentRef.setInput('konto', testkonto());
    fixture.detectChanges();

    fixture.componentInstance.sonderrolleUmschalten('verwaltungshelfer', true);
    expect(fixture.componentInstance.entwurfSonderrollen()).toEqual(['verwaltungshelfer']);

    fixture.componentInstance.sonderrolleUmschalten('verwaltungshelfer', false);
    expect(fixture.componentInstance.entwurfSonderrollen()).toEqual([]);
  });

  it('meldet den Entwurf erst beim Übernehmen-Klick, nicht bei jeder Änderung', () => {
    const fixture = TestBed.createComponent(BenutzerZeile);
    fixture.componentRef.setInput('konto', testkonto());
    fixture.detectChanges();

    let emittiert: { rolle: string | null; sonderrollen: string[] } | undefined;
    fixture.componentInstance.uebernehmen.subscribe((wert) => (emittiert = wert));

    fixture.componentInstance.hauptrolleAendern('helfer');
    fixture.componentInstance.sonderrolleUmschalten('verwaltungshelfer', true);
    expect(emittiert).toBeUndefined();

    fixture.componentInstance.uebernehmenKlick();
    expect(emittiert).toEqual({ rolle: 'helfer', sonderrollen: ['verwaltungshelfer'] });
  });

  it('richtet den Entwurf neu aus, wenn sich das Konto von außen ändert (nach erfolgreichem Speichern)', () => {
    const fixture = TestBed.createComponent(BenutzerZeile);
    fixture.componentRef.setInput('konto', testkonto());
    fixture.detectChanges();

    fixture.componentInstance.hauptrolleAendern('helfer');
    expect(fixture.componentInstance.hatAenderung()).toBe(true);

    fixture.componentRef.setInput('konto', testkonto({ rolle: 'helfer' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.entwurfRolle()).toBe('helfer');
    expect(fixture.componentInstance.hatAenderung()).toBe(false);
  });
});
