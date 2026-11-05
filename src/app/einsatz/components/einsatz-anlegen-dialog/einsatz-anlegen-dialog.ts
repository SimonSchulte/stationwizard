import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Einsatz } from '../../models/einsatz.model';

/** Eingaben des Dialogs; Zeiten als lokale Berliner Zeit `YYYY-MM-DDTHH:mm`. */
export type EinsatzAnlegenDaten = Pick<Einsatz, 'titel' | 'beginn' | 'ende' | 'ort'>;

/** Kleiner Dialog für einen Einsatz ohne HiOrg-Veranstaltung: Titel, Zeitraum, Ort. */
@Component({
  selector: 'app-einsatz-anlegen-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './einsatz-anlegen-dialog.html',
  styleUrl: './einsatz-anlegen-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinsatzAnlegenDialog {
  private readonly dialogRef = inject(MatDialogRef<EinsatzAnlegenDialog, EinsatzAnlegenDaten>);

  readonly titel = signal('');
  readonly beginn = signal('');
  readonly ende = signal('');
  readonly ort = signal('');

  readonly endeVorBeginn = computed(
    () => this.beginn() !== '' && this.ende() !== '' && this.ende() < this.beginn(),
  );
  readonly kannAnlegen = computed(() => this.titel().trim() !== '' && !this.endeVorBeginn());

  /** Zeigt `mat-error` am Ende-Feld, sobald der Zeitraum verdreht ist. */
  readonly endeFehler: ErrorStateMatcher = { isErrorState: () => this.endeVorBeginn() };

  anlegen(): void {
    if (!this.kannAnlegen()) return;
    const ergebnis: EinsatzAnlegenDaten = {
      titel: this.titel().trim(),
      beginn: this.beginn() || null,
      ende: this.ende() || null,
      ort: this.ort().trim() || null,
    };
    this.dialogRef.close(ergebnis);
  }
}
