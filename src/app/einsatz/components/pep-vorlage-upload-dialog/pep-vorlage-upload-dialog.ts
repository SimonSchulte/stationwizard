import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PEP_GRENZEN } from '../../models/pep.model';

export interface PepVorlageUploadDaten {
  /** Vorbelegung: Name der Planung in der Datei. */
  titel: string;
  posten: number;
  positionen: number;
  /** Einsatzkräfte der Datei; sie werden nicht übernommen. */
  einsatzkraefte: number;
}

/**
 * Vorschau beim Hochladen einer Einsatzplandatei als PEP-Vorlage: Titel (editierbar), Zahl
 * der Posten und Positionen und der Hinweis, was nicht übernommen wird. Schließt mit dem
 * gewählten Titel, bei Abbrechen mit `null`; gespeichert wird durch den Aufrufer.
 */
@Component({
  selector: 'app-pep-vorlage-upload-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './pep-vorlage-upload-dialog.html',
  styleUrl: './pep-vorlage-upload-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PepVorlageUploadDialog {
  readonly daten = inject<PepVorlageUploadDaten>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<PepVorlageUploadDialog, string | null>>(MatDialogRef);

  readonly maxTitel = PEP_GRENZEN.titel;
  readonly titel = signal(this.daten.titel.trim().slice(0, PEP_GRENZEN.titel));
  readonly kannSpeichern = computed(() => this.titel().trim() !== '');
}
