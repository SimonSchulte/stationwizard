import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface EingabeDialogDaten {
  titel: string;
  nachricht: string;
  label: string;
  bestaetigenLabel: string;
  wert: string;
  /** Leere Eingabe zulassen; sonst bleibt „Bestätigen“ gesperrt. */
  leerErlaubt: boolean;
  maxLaenge: number;
}

/** Kurze Freitextabfrage; schließt mit dem Text oder ohne Ergebnis (Abbrechen). */
@Component({
  selector: 'app-eingabe-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './eingabe-dialog.html',
  styleUrl: './eingabe-dialog.less',
})
export class EingabeDialog {
  readonly daten = inject<EingabeDialogDaten>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<EingabeDialog, string | null>>(MatDialogRef);
  readonly wert = signal(this.daten.wert);
}
