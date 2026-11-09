import { TestBed } from '@angular/core/testing';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { describe, expect, it, vi } from 'vitest';
import { MeldungSnackbar, type MeldungSnackbarDaten } from './meldung-snackbar';

describe('MeldungSnackbar', () => {
  function aufbauen(daten: MeldungSnackbarDaten) {
    const ref = { dismiss: vi.fn(), dismissWithAction: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_SNACK_BAR_DATA, useValue: daten },
        { provide: MatSnackBarRef, useValue: ref },
      ],
    });
    const fixture = TestBed.createComponent(MeldungSnackbar);
    fixture.detectChanges();
    return {
      ref,
      wurzel: fixture.nativeElement as HTMLElement,
      instanz: fixture.componentInstance,
    };
  }

  it('löst beim Klick auf die Aktion onAction aus (dismissWithAction)', () => {
    const { ref, wurzel } = aufbauen({ art: 'fehler', text: 'Kaputt', aktion: 'Erneut versuchen' });
    const knopf = wurzel.querySelector<HTMLButtonElement>('button[matSnackBarAction]');
    expect(knopf?.textContent).toContain('Erneut versuchen');
    knopf?.click();
    expect(ref.dismissWithAction).toHaveBeenCalledTimes(1);
    expect(ref.dismiss).not.toHaveBeenCalled();
  });

  it('zeigt ohne Aktion keinen Aktionsknopf und schließt per Kreuz als Person', () => {
    const { ref, wurzel, instanz } = aufbauen({ art: 'info', text: 'Hinweis', aktion: null });
    expect(wurzel.querySelector('button[matSnackBarAction]')).toBeNull();
    wurzel.querySelector<HTMLButtonElement>('button[aria-label="Meldung schließen"]')?.click();
    expect(ref.dismiss).toHaveBeenCalledTimes(1);
    expect(instanz.vonPersonGeschlossen).toBe(true);
  });
});
