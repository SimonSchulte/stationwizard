import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AngebotStand } from '../../models/vorgang.model';

/** Summe der Angebote, die eine Mail höchstens trägt; dieselbe Grenze prüft der Worker. */
export const ANHAENGE_BYTES_MAX = 3 * 1024 * 1024;
export const SENDEN_NACHRICHT_MAX = 1000;

export interface SendenDialogDaten {
  einreichen: boolean;
  empfaenger: string[];
  angebote: AngebotStand[];
}

export interface SendenErgebnis {
  empfaenger: string[];
  angebote: string[];
  nachricht: string;
}

/** Wählt Empfänger (aus der Systemkonfiguration), Angebote als Anhang und eine Nachricht. */
@Component({
  selector: 'app-senden-dialog',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './senden-dialog.html',
  styleUrl: './senden-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendenDialog {
  readonly daten = inject<SendenDialogDaten>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<SendenDialog, SendenErgebnis | null>>(MatDialogRef);

  readonly MAX = SENDEN_NACHRICHT_MAX;

  readonly gewaehlt = signal<string[]>([...this.daten.empfaenger]);
  readonly nachricht = signal('');

  readonly angebotGroesse = this.daten.angebote.reduce((summe, a) => summe + a.groesse, 0);
  readonly angebotePassen = this.angebotGroesse <= ANHAENGE_BYTES_MAX;
  readonly mitAngeboten = signal(this.daten.angebote.length > 0 && this.angebotePassen);

  readonly gueltig = computed(() => this.gewaehlt().length > 0);

  empfaengerUmschalten(adresse: string, an: boolean): void {
    this.gewaehlt.update((liste) =>
      an ? [...liste, adresse] : liste.filter((eintrag) => eintrag !== adresse),
    );
  }

  megabyte(byte: number): string {
    return (byte / (1024 * 1024)).toFixed(1).replace('.', ',');
  }

  senden(): void {
    if (!this.gueltig()) return;
    this.dialogRef.close({
      empfaenger: this.daten.empfaenger.filter((a) => this.gewaehlt().includes(a)),
      angebote: this.mitAngeboten() ? this.daten.angebote.map((a) => a.id) : [],
      nachricht: this.nachricht().trim(),
    });
  }
}
