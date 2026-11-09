import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { AbschnittDialog, AbschnittDialogDaten, AbschnittDialogErgebnis } from './abschnitt-dialog';

function erzeuge(daten: Partial<AbschnittDialogDaten> = {}) {
  const schliessen = vi.fn<(ergebnis?: AbschnittDialogErgebnis) => void>();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          titel: 'Betreuung',
          farbe: 'abschnitt-1',
          fachgruppe: null,
          laufzettelAnzahl: 3,
          ...daten,
        } satisfies AbschnittDialogDaten,
      },
      { provide: MatDialogRef, useValue: { close: schliessen } },
    ],
  });
  const fixture = TestBed.createComponent(AbschnittDialog);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, schliessen };
}

function knopf(element: HTMLElement, text: string): HTMLButtonElement {
  return [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  )!;
}

describe('AbschnittDialog', () => {
  it('bietet alle acht Farben als benannte Radiogruppe an', () => {
    const { element } = erzeuge();
    const radios = element.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(8);
    expect(radios[0].getAttribute('aria-label')).toBe('Orange');
    expect(radios[0].checked).toBe(true);
    expect(element.querySelectorAll('.farbe mat-icon').length).toBe(1);
  });

  it('übernimmt Titel und Farbe und reicht die Fachgruppe unverändert durch', () => {
    const { fixture, element, schliessen } = erzeuge({ fachgruppe: 'tesi' });
    const titel = element.querySelector<HTMLInputElement>('input[matInput]')!;
    titel.value = 'Rollwagen 01';
    titel.dispatchEvent(new Event('input'));
    element.querySelectorAll<HTMLInputElement>('input[type="radio"]')[3].click();
    fixture.detectChanges();
    expect(element.querySelector('.vorschau')?.textContent).toContain('Rollwagen 01');
    knopf(element, 'Übernehmen').click();
    expect(schliessen).toHaveBeenCalledWith({
      aktion: 'speichern',
      titel: 'Rollwagen 01',
      farbe: 'abschnitt-4',
      fachgruppe: 'tesi',
      foto: null,
    });
  });

  it('bietet keine Fachgruppe und kein Übertragen an', () => {
    const { element } = erzeuge({ fachgruppe: 'tesi' });
    expect(element.querySelector('mat-chip-listbox')).toBeNull();
    expect(element.querySelector('mat-checkbox')).toBeNull();
    expect(element.querySelector('app-fachgruppe-chip')).toBeNull();
  });

  it('sperrt Übernehmen ohne Titel', () => {
    const { element } = erzeuge({ titel: '   ', laufzettelAnzahl: 0 });
    expect(knopf(element, 'Übernehmen').disabled).toBe(true);
  });

  it('meldet das Löschen an die Seite', () => {
    const { element, schliessen } = erzeuge();
    knopf(element, 'Abschnitt löschen').click();
    expect(schliessen).toHaveBeenCalledWith({ aktion: 'loeschen' });
  });
});
