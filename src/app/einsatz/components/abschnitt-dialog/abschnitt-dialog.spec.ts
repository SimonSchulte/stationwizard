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

  it('übernimmt Titel, Farbe, Fachgruppe und Übertragen', () => {
    const { fixture, element, schliessen } = erzeuge();
    const titel = element.querySelector<HTMLInputElement>('input[matInput]')!;
    titel.value = 'TeSi';
    titel.dispatchEvent(new Event('input'));
    element.querySelectorAll<HTMLInputElement>('input[type="radio"]')[3].click();
    (
      fixture.componentInstance as unknown as { fachgruppeGewaehlt(w: unknown): void }
    ).fachgruppeGewaehlt('tesi');
    element.querySelector<HTMLInputElement>('mat-checkbox input')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.vorschau')?.textContent).toContain('TeSi');
    knopf(element, 'Übernehmen').click();
    expect(schliessen).toHaveBeenCalledWith({
      aktion: 'speichern',
      titel: 'TeSi',
      farbe: 'abschnitt-4',
      fachgruppe: 'tesi',
      uebertragen: true,
      foto: null,
    });
  });

  it('sperrt Übernehmen ohne Titel und blendet „Übertragen“ ohne Laufzettel aus', () => {
    const { fixture, element } = erzeuge({ titel: '   ', laufzettelAnzahl: 0 });
    expect(knopf(element, 'Übernehmen').disabled).toBe(true);
    expect(element.querySelector('mat-checkbox')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('meldet das Löschen an die Seite', () => {
    const { element, schliessen } = erzeuge();
    knopf(element, 'Abschnitt löschen').click();
    expect(schliessen).toHaveBeenCalledWith({ aktion: 'loeschen' });
  });
});
