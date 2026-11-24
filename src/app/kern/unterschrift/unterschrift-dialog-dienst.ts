import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MeldungsDienst } from '../zustand/meldungs-dienst';
import {
  UnterschriftDialog,
  UnterschriftDialogDaten,
  UnterschriftDialogErgebnis,
} from './unterschrift-dialog';
import { UnterschriftStoreService } from './unterschrift-store.service';
import { UnterschriftDaten } from './unterschrift.model';

/** Öffnet den Dialog zur eigenen Unterschrift und speichert das Ergebnis. */
@Injectable({ providedIn: 'root' })
export class UnterschriftDialogDienst {
  private readonly dialog = inject(MatDialog);
  private readonly store = inject(UnterschriftStoreService);
  private readonly meldungen = inject(MeldungsDienst);

  /** Liefert die gespeicherte Unterschrift oder `null` bei Abbrechen, Entfernen und Fehler. */
  async bearbeiten(name: string): Promise<UnterschriftDaten | null> {
    const aktuell = await this.store.laden();
    const referenz = this.dialog.open<
      UnterschriftDialog,
      UnterschriftDialogDaten,
      UnterschriftDialogErgebnis | null
    >(UnterschriftDialog, { data: { aktuell, name }, width: '520px', maxWidth: '95vw' });
    const ergebnis = await firstValueFrom(referenz.afterClosed());
    if (!ergebnis) return null;

    if (ergebnis === 'entfernen') {
      if (await this.store.entfernen()) this.meldungen.erfolg('Unterschrift entfernt.');
      else this.meldungen.fehler(this.store.fehler());
      return null;
    }
    if (await this.store.speichern(ergebnis)) {
      this.meldungen.erfolg('Unterschrift gespeichert.');
      return ergebnis;
    }
    this.meldungen.fehler(this.store.fehler());
    return null;
  }
}
