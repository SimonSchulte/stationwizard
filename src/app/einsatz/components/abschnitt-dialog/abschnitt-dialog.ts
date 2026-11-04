import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  FACHGRUPPE_BEZEICHNUNG,
  FACHGRUPPE_FARBVARIABLE,
  FACHGRUPPEN,
  Fachgruppe,
  istFachgruppe,
} from '../../../kern/fachgruppen/fachgruppe';
import {
  ABSCHNITT_FARBEN,
  ABSCHNITT_FARBE_BEZEICHNUNG,
  AbschnittFarbe,
  VB_GRENZEN,
} from '../../models/vb.model';
import { FachgruppeChip } from '../fachgruppe-chip/fachgruppe-chip';

export interface AbschnittDialogDaten {
  titel: string;
  farbe: AbschnittFarbe;
  fachgruppe: Fachgruppe | null;
  /** Anzahl der Laufzettel im Abschnitt (für „Auf alle … übertragen“ und das Löschen). */
  laufzettelAnzahl: number;
}

export type AbschnittDialogErgebnis =
  | {
      aktion: 'speichern';
      titel: string;
      farbe: AbschnittFarbe;
      fachgruppe: Fachgruppe | null;
      uebertragen: boolean;
    }
  | { aktion: 'loeschen' };

/**
 * Dialog „Abschnitt bearbeiten“: Titel, Farbe aus der festen Palette, Fachgruppe (Vorgabe für
 * die Laufzettel, auf Wunsch auf alle übertragbar) und eine Vorschau des Laufzettelkopfs.
 * Schließt mit dem Ergebnis; Bestätigung und Ausführung des Löschens liegen bei der Seite.
 */
@Component({
  selector: 'app-abschnitt-dialog',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    FachgruppeChip,
  ],
  templateUrl: './abschnitt-dialog.html',
  styleUrl: './abschnitt-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbschnittDialog {
  protected readonly daten = inject<AbschnittDialogDaten>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<AbschnittDialog, AbschnittDialogErgebnis>>(MatDialogRef);

  protected readonly farben = ABSCHNITT_FARBEN;
  protected readonly farbBezeichnung = ABSCHNITT_FARBE_BEZEICHNUNG;
  protected readonly fachgruppen = FACHGRUPPEN;
  protected readonly fachgruppeBezeichnung = FACHGRUPPE_BEZEICHNUNG;
  protected readonly fachgruppeFarbe = FACHGRUPPE_FARBVARIABLE;
  protected readonly maxTitel = VB_GRENZEN.text;

  protected readonly titel = signal(this.daten.titel);
  protected readonly farbe = signal<AbschnittFarbe>(this.daten.farbe);
  protected readonly fachgruppe = signal<Fachgruppe | null>(this.daten.fachgruppe);
  protected readonly uebertragen = signal(false);

  protected readonly gueltig = computed(() => this.titel().trim() !== '');

  protected fachgruppeGewaehlt(wert: unknown): void {
    this.fachgruppe.set(istFachgruppe(wert) ? wert : null);
  }

  protected speichern(): void {
    if (!this.gueltig()) return;
    this.dialogRef.close({
      aktion: 'speichern',
      titel: this.titel().trim(),
      farbe: this.farbe(),
      fachgruppe: this.fachgruppe(),
      uebertragen: this.uebertragen(),
    });
  }

  protected loeschen(): void {
    this.dialogRef.close({ aktion: 'loeschen' });
  }
}
