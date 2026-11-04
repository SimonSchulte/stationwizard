import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';
import { VbVorlagenStoreService } from '../../services/vb-vorlagen-store.service';

/** Wählt die VB-Vorlage, die für einen Einsatz kopiert wird; schließt mit der Vorlagen-Id. */
@Component({
  selector: 'app-vorlage-wahl-dialog',
  imports: [
    Ladeanzeige,
    Leerzustand,
    Meldung,
    MatButtonModule,
    MatDialogModule,
    MatRadioModule,
    Suchfeld,
  ],
  templateUrl: './vorlage-wahl-dialog.html',
  styleUrl: './vorlage-wahl-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VorlageWahlDialog {
  private readonly dialogRef = inject(MatDialogRef<VorlageWahlDialog, string>);
  protected readonly store = inject(VbVorlagenStoreService);

  readonly suche = signal('');
  readonly gewaehlt = signal<string | null>(null);

  readonly sichtbar = computed(() => {
    const begriff = this.suche().trim().toLocaleLowerCase('de-DE');
    return this.store
      .vorlagen()
      .filter((vorlage) => !begriff || vorlage.titel.toLocaleLowerCase('de-DE').includes(begriff));
  });

  constructor() {
    void this.store.laden();
  }

  bestaetigen(): void {
    const id = this.gewaehlt();
    if (id !== null) this.dialogRef.close(id);
  }
}
