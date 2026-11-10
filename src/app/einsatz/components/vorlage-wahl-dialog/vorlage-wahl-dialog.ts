import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { firstValueFrom } from 'rxjs';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';
import { PepVorlagenStoreService } from '../../services/pep-vorlagen-store.service';

/** Ergebnis des Dialogs: eine Vorlage kopieren oder leer beginnen; Abbrechen schließt ohne Wert. */
export type VorlageWahlErgebnis = { art: 'vorlage'; vorlageId: string } | { art: 'leer' };

/** Wofür eine Vorlage gewählt wird: PEP (Posten und Positionen). */
export type VorlageArt = 'pep';

export interface VorlageWahlDaten {
  art: VorlageArt;
}

/** Eine Zeile der Auswahl, unabhängig von der Art der Vorlage. */
interface VorlageZeile {
  id: string;
  titel: string;
  kennzahlen: string;
}

/**
 * Öffnet den Dialog „Vorlage wählen“ für die Art und liefert die Wahl; `undefined` beim
 * Abbrechen. Genutzt vom `PepEditorOeffnenDienst`; der Aufbau bietet seine Vorlagen im Editor selbst an.
 */
export async function vorlageWaehlen(
  dialog: MatDialog,
  art: VorlageArt,
): Promise<VorlageWahlErgebnis | undefined> {
  return firstValueFrom(
    dialog
      .open<VorlageWahlDialog, VorlageWahlDaten, VorlageWahlErgebnis>(VorlageWahlDialog, {
        width: '560px',
        maxWidth: '94vw',
        data: { art },
      })
      .afterClosed(),
    { defaultValue: undefined },
  );
}

/**
 * Wählt die PEP-Vorlage, die für einen Einsatz
 * kopiert wird, oder den leeren Anfang.
 */
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
  private readonly dialogRef = inject(MatDialogRef<VorlageWahlDialog, VorlageWahlErgebnis>);
  private readonly injector = inject(Injector);
  protected readonly art: VorlageArt =
    inject<VorlageWahlDaten | null>(MAT_DIALOG_DATA, { optional: true })?.art ?? 'pep';
  protected readonly store = this.injector.get(PepVorlagenStoreService);

  readonly suche = signal('');
  readonly gewaehlt = signal<string | null>(null);

  protected readonly zeilen = computed<VorlageZeile[]>(() =>
    this.store.vorlagen().map((vorlage) => ({
      id: vorlage.id,
      titel: vorlage.titel,
      kennzahlen: `${vorlage.posten} Posten · ${vorlage.positionen} Positionen · Version ${vorlage.version}`,
    })),
  );

  readonly sichtbar = computed(() => {
    const begriff = this.suche().trim().toLocaleLowerCase('de-DE');
    return this.zeilen().filter(
      (vorlage) => !begriff || vorlage.titel.toLocaleLowerCase('de-DE').includes(begriff),
    );
  });

  constructor() {
    void this.store.laden();
  }

  bestaetigen(): void {
    const id = this.gewaehlt();
    if (id !== null) this.dialogRef.close({ art: 'vorlage', vorlageId: id });
  }

  leerBeginnen(): void {
    this.dialogRef.close({ art: 'leer' });
  }
}
