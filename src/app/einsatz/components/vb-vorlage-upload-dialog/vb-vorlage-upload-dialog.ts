import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AbschnittFarbe, VB_GRENZEN } from '../../models/vb.model';
import { laufzettelPlatz } from '../../services/laufzettel-platz';
import { VbExcelErgebnis } from '../../services/vb-excel-import';
import { vbInhaltProbleme } from '../../services/vb-pruefung';
import { AbschnittFarbpunkt } from '../abschnitt-farbpunkt/abschnitt-farbpunkt';

export interface VbVorlageUploadDaten {
  /** Vorbelegung des Titels, aus dem Dateinamen. */
  titel: string;
  ergebnis: VbExcelErgebnis;
}

interface LaufzettelVorschau {
  titel: string;
  positionen: number;
  belegt: number;
  kapazitaet: number;
  zuVoll: boolean;
}

interface AbschnittVorschau {
  titel: string;
  farbe: AbschnittFarbe;
  laufzettel: LaufzettelVorschau[];
}

/**
 * Vorschau beim Hochladen einer Excel-Packliste als VB-Vorlage: Titel (editierbar), Abschnitte
 * mit ihren Laufzetteln und die Auffälligkeiten. Gespeichert werden kann nur, wenn die
 * Vorabprüfung der VB keine Probleme meldet. Schließt mit dem Titel, bei Abbrechen mit `null`.
 */
@Component({
  selector: 'app-vb-vorlage-upload-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    AbschnittFarbpunkt,
  ],
  templateUrl: './vb-vorlage-upload-dialog.html',
  styleUrl: './vb-vorlage-upload-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VbVorlageUploadDialog {
  readonly daten = inject<VbVorlageUploadDaten>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<VbVorlageUploadDialog, string | null>>(MatDialogRef);

  readonly maxTitel = VB_GRENZEN.text;
  readonly titel = signal(this.daten.titel.trim().slice(0, VB_GRENZEN.text));
  readonly auffaelligkeiten = this.daten.ergebnis.auffaelligkeiten;
  readonly probleme = vbInhaltProbleme(this.daten.ergebnis.inhalt);
  readonly kannSpeichern = computed(() => this.titel().trim() !== '' && this.probleme.length === 0);

  readonly abschnitte: AbschnittVorschau[] = this.daten.ergebnis.inhalt.abschnitte.map(
    (abschnitt) => ({
      titel: abschnitt.titel,
      farbe: abschnitt.farbe,
      laufzettel: abschnitt.laufzettel.map((laufzettel) => {
        const platz = laufzettelPlatz(laufzettel);
        return {
          titel: laufzettel.lagerort || laufzettel.ueberschrift,
          positionen: laufzettel.positionen.length,
          belegt: platz.belegt,
          kapazitaet: platz.kapazitaet,
          zuVoll: platz.zustand === 'zu-voll',
        };
      }),
    }),
  );
}
