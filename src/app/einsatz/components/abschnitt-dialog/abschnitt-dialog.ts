import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Fachgruppe } from '../../../kern/fachgruppen/fachgruppe';
import {
  ABSCHNITT_FARBEN,
  ABSCHNITT_FARBE_BEZEICHNUNG,
  AbschnittFarbe,
  VB_GRENZEN,
} from '../../models/vb.model';
import { fotoVerkleinern } from '../../services/foto-verkleinern';

export interface AbschnittDialogDaten {
  titel: string;
  farbe: AbschnittFarbe;
  fachgruppe: Fachgruppe | null;
  /** Anzahl der Laufzettel im Abschnitt (für „Auf alle … übertragen“ und das Löschen). */
  laufzettelAnzahl: number;
  /** Aktuelles Verladungsfoto (JPEG-Data-URL). */
  foto?: string;
}

export type AbschnittDialogErgebnis =
  | {
      aktion: 'speichern';
      titel: string;
      farbe: AbschnittFarbe;
      /** Unverändert durchgereicht: die Oberfläche bearbeitet die Fachgruppe vorerst nicht. */
      fachgruppe: Fachgruppe | null;
      /** `null`: Foto entfernen. */
      foto: string | null;
    }
  | { aktion: 'loeschen' };

/**
 * Dialog „Abschnitt bearbeiten“: Titel, Farbe aus der festen Palette, Verladungsfoto und eine
 * Vorschau des Laufzettelkopfs. Die Fachgruppe wird vorerst nicht bearbeitet.
 * Schließt mit dem Ergebnis; Bestätigung und Ausführung des Löschens liegen bei der Seite.
 */
@Component({
  selector: 'app-abschnitt-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule],
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
  protected readonly maxTitel = VB_GRENZEN.text;

  protected readonly titel = signal(this.daten.titel);
  protected readonly farbe = signal<AbschnittFarbe>(this.daten.farbe);
  protected readonly foto = signal<string | null>(this.daten.foto ?? null);
  protected readonly fotoFehler = signal('');
  protected readonly fotoLaeuft = signal(false);

  protected readonly gueltig = computed(() => this.titel().trim() !== '');

  protected async fotoGewaehlt(ereignis: Event): Promise<void> {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    eingabe.value = '';
    if (!datei) return;
    this.fotoFehler.set('');
    this.fotoLaeuft.set(true);
    try {
      this.foto.set(await fotoVerkleinern(datei));
    } catch (fehler) {
      this.fotoFehler.set(fehler instanceof Error ? fehler.message : 'Das Foto ging nicht.');
    } finally {
      this.fotoLaeuft.set(false);
    }
  }

  protected speichern(): void {
    if (!this.gueltig()) return;
    this.dialogRef.close({
      aktion: 'speichern',
      titel: this.titel().trim(),
      farbe: this.farbe(),
      fachgruppe: this.daten.fachgruppe,
      foto: this.foto(),
    });
  }

  protected loeschen(): void {
    this.dialogRef.close({ aktion: 'loeschen' });
  }
}
