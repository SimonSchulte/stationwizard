import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EinsatzAnlegenDialog } from './einsatz-anlegen-dialog';

describe('EinsatzAnlegenDialog', () => {
  const close = vi.fn();

  function oeffnen() {
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialogRef, useValue: { close } }],
    });
    return TestBed.createComponent(EinsatzAnlegenDialog).componentInstance;
  }

  beforeEach(() => close.mockClear());

  it('verlangt einen Titel und schließt mit bereinigten Werten', () => {
    const dialog = oeffnen();
    dialog.anlegen();
    expect(close).not.toHaveBeenCalled();

    dialog.titel.set('  Stadtlauf ');
    dialog.beginn.set('2026-06-06T09:00');
    dialog.ort.set('   ');
    dialog.anlegen();
    expect(close).toHaveBeenCalledWith({
      titel: 'Stadtlauf',
      beginn: '2026-06-06T09:00',
      ende: null,
      ort: null,
    });
  });

  it('lehnt ein Ende vor dem Beginn ab', () => {
    const dialog = oeffnen();
    dialog.titel.set('Stadtlauf');
    dialog.beginn.set('2026-06-06T09:00');
    dialog.ende.set('2026-06-06T08:00');
    expect(dialog.endeVorBeginn()).toBe(true);
    dialog.anlegen();
    expect(close).not.toHaveBeenCalled();
  });
});
