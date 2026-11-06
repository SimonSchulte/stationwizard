import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { TerminDialog, type TerminDialogDaten } from './termin-dialog';

function dialog(daten: TerminDialogDaten) {
  const schliessen = vi.fn();
  const bestaetigen = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: daten },
      {
        provide: MatDialogRef,
        useValue: { close: schliessen, backdropClick: () => EMPTY, keydownEvents: () => EMPTY },
      },
      { provide: DialogDienst, useValue: { bestaetigen } },
    ],
  });
  return {
    instanz: TestBed.runInInjectionContext(() => new TerminDialog()),
    schliessen,
    bestaetigen,
  };
}

describe('TerminDialog', () => {
  it('legt Neues standardmäßig als „Termin“ an, nicht als Dienst', () => {
    const { instanz } = dialog({ datum: '2026-03-02' });
    expect(instanz.entwurf().typ).toBe('termin');
    expect(instanz.entwurf().datum).toBe('2026-03-02');
  });

  it('schließt ohne Rückfrage, solange nichts geändert wurde', async () => {
    const { instanz, schliessen, bestaetigen } = dialog({ datum: '2026-03-02' });
    await instanz.abbrechen();
    expect(bestaetigen).not.toHaveBeenCalled();
    expect(schliessen).toHaveBeenCalledWith(false);
  });

  it('fragt bei geänderten Eingaben nach und bleibt offen, wenn die Person ablehnt', async () => {
    const { instanz, schliessen, bestaetigen } = dialog({ datum: '2026-03-02' });
    instanz.setze('thema', 'Funk');
    bestaetigen.mockResolvedValue(false);
    await instanz.abbrechen();
    expect(bestaetigen).toHaveBeenCalled();
    expect(schliessen).not.toHaveBeenCalled();
  });
});
