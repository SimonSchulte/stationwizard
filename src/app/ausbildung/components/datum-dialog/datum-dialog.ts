import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { heuteIso } from '../../../kern/kalender/datum';

export interface DatumDialogDaten {
  titel: string;
  vorgabe?: string | null;
}

/** Kleiner Dialog zum Setzen eines Datums (neuer Termin, Idee einplanen). */
@Component({
  selector: 'app-datum-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './datum-dialog.html',
  styleUrl: './datum-dialog.less',
})
export class DatumDialog {
  readonly daten = inject<DatumDialogDaten>(MAT_DIALOG_DATA);
  readonly datum = signal(this.daten.vorgabe || heuteIso());
}
