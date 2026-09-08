import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { GemeinsamerDialog, GemeinsameDialogDaten } from './gemeinsamer-dialog';

/** Gemeinsame Hinweise und Bestätigungen beider Fachbereiche. */
@Injectable({ providedIn: 'root' })
export class DialogDienst {
  private readonly dialog = inject(MatDialog);

  async bestaetigen(
    nachricht: string,
    titel = 'Änderungen bestätigen',
    bestaetigenLabel = 'Fortfahren',
  ): Promise<boolean> {
    return await this.oeffnen({ titel, nachricht, bestaetigenLabel, abbrechenLabel: 'Abbrechen' });
  }

  async hinweis(nachricht: string, titel = 'Hinweis'): Promise<void> {
    await this.oeffnen({ titel, nachricht, bestaetigenLabel: 'Verstanden' });
  }

  private async oeffnen(daten: GemeinsameDialogDaten): Promise<boolean> {
    const referenz = this.dialog.open<GemeinsamerDialog, GemeinsameDialogDaten, boolean>(
      GemeinsamerDialog,
      {
        data: daten,
        width: '520px',
        maxWidth: '94vw',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      },
    );
    return (await firstValueFrom(referenz.afterClosed(), { defaultValue: false })) === true;
  }
}
