import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import { anzeigenameAusEmail } from '../../../kern/text/anzeigename';

export interface PersonWahlDaten {
  titel: string;
  nachricht: string;
  /** Diese Adresse (die eigene) steht nicht zur Wahl. */
  ausser: string;
}

/** Wählt eine Person aus den bereits angemeldeten Benutzern; schließt mit ihrer E-Mail-Adresse. */
@Component({
  selector: 'app-person-wahl-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './person-wahl-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonWahlDialog implements OnInit {
  readonly daten = inject<PersonWahlDaten>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<PersonWahlDialog, string | null>>(MatDialogRef);
  private readonly store = inject(BenutzerverwaltungStoreService);

  readonly gewaehlt = signal('');
  readonly laedt = this.store.listeLaedt;
  readonly personen = computed(() =>
    this.store
      .benutzer()
      .filter((b) => b.email !== this.daten.ausser)
      .map((b) => ({ email: b.email, name: b.anzeigename ?? anzeigenameAusEmail(b.email) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  ngOnInit(): void {
    void this.store.listeLaden();
  }
}
