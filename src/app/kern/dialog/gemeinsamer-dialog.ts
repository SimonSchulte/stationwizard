import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface GemeinsameDialogDaten {
  titel: string;
  nachricht: string;
  bestaetigenLabel: string;
  abbrechenLabel?: string;
}

@Component({
  selector: 'app-gemeinsamer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './gemeinsamer-dialog.html',
  styleUrl: './gemeinsamer-dialog.less',
})
export class GemeinsamerDialog {
  readonly daten = inject<GemeinsameDialogDaten>(MAT_DIALOG_DATA);
}
