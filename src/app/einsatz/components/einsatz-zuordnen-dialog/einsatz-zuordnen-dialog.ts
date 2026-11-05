import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';
import { EinsatzStoreService } from '../../services/einsatz-store.service';
import { EinsatzListenEintrag } from '../../models/einsatz.model';
import { datumsblock } from '../../services/einsatz-anzeige';

/**
 * Wählt den Einsatz, dem eine geladene Planungsdatei als PEP zugeordnet wird. Angeboten
 * werden nur Einsätze ohne PEP (eine PEP je Einsatz). Schließt mit dem gewählten Eintrag.
 */
@Component({
  selector: 'app-einsatz-zuordnen-dialog',
  imports: [
    Ladeanzeige,
    Leerzustand,
    Meldung,
    MatButtonModule,
    MatDialogModule,
    MatRadioModule,
    Suchfeld,
  ],
  templateUrl: './einsatz-zuordnen-dialog.html',
  styleUrl: './einsatz-zuordnen-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinsatzZuordnenDialog {
  private readonly dialogRef = inject(MatDialogRef<EinsatzZuordnenDialog, EinsatzListenEintrag>);
  protected readonly store = inject(EinsatzStoreService);

  readonly suche = signal('');
  readonly gewaehlt = signal<string | null>(null);

  /** Einsätze ohne PEP, mit Datum als Zusatz. */
  protected readonly zeilen = computed(() =>
    this.store
      .einsaetze()
      .filter((einsatz) => einsatz.pep === null)
      .map((einsatz) => {
        const datum = datumsblock(einsatz.beginn, new Date().getFullYear());
        return {
          einsatz,
          zusatz: datum ? `${datum.tag}. ${datum.monat} · ${datum.wochentagZeit}` : 'ohne Datum',
        };
      }),
  );

  readonly sichtbar = computed(() => {
    const begriff = this.suche().trim().toLocaleLowerCase('de-DE');
    return this.zeilen().filter(
      (zeile) => !begriff || zeile.einsatz.titel.toLocaleLowerCase('de-DE').includes(begriff),
    );
  });

  constructor() {
    void this.store.laden();
  }

  bestaetigen(): void {
    const eintrag = this.store.einsaetze().find((einsatz) => einsatz.id === this.gewaehlt());
    if (eintrag) this.dialogRef.close(eintrag);
  }
}
