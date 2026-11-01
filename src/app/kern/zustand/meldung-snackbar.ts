import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarAction,
  MatSnackBarActions,
  MatSnackBarLabel,
  MatSnackBarRef,
} from '@angular/material/snack-bar';
import type { MeldungArt } from './meldung-art';

export interface MeldungSnackbarDaten {
  art: MeldungArt;
  text: string;
  aktion: string | null;
}

const SYMBOL: Readonly<Record<MeldungArt, string>> = {
  fehler: 'error',
  warnung: 'warning',
  info: 'info',
  erfolg: 'check_circle',
};

/** Inhalt der Material-Snackbar: Symbol, Text, optionale Aktion und Schließen. */
@Component({
  selector: 'app-meldung-snackbar',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSnackBarAction,
    MatSnackBarActions,
    MatSnackBarLabel,
  ],
  templateUrl: './meldung-snackbar.html',
  styleUrl: './meldung-snackbar.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeldungSnackbar {
  protected readonly daten = inject<MeldungSnackbarDaten>(MAT_SNACK_BAR_DATA);
  private readonly ref = inject(MatSnackBarRef<MeldungSnackbar>);
  protected readonly symbol = SYMBOL[this.daten.art];
  /** Unterscheidet das bewusste Schließen vom Ablauf der Anzeigedauer. */
  vonPersonGeschlossen = false;

  protected schliessen(): void {
    this.vonPersonGeschlossen = true;
    this.ref.dismiss();
  }
}
