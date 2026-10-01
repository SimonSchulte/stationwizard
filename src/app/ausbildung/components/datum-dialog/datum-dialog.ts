import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DATE_LOCALE, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { heuteIso, isoZuLokalesDatum, lokalesDatumZuIso } from '../../../kern/kalender/datum';

export interface DatumDialogDaten {
  titel: string;
  vorgabe?: string | null;
}

/** Kleiner Dialog zum Setzen eines Datums (neuer Termin, Idee einplanen). */
@Component({
  selector: 'app-datum-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'de-DE' }],
  templateUrl: './datum-dialog.html',
  styleUrl: './datum-dialog.less',
})
export class DatumDialog {
  readonly daten = inject<DatumDialogDaten>(MAT_DIALOG_DATA);
  /** ISO-Datum (`YYYY-MM-DD`); leer, solange die Eingabe kein gültiges Datum ergibt. */
  readonly datum = signal(this.daten.vorgabe || heuteIso());
  readonly datumWert = isoZuLokalesDatum(this.datum());

  datumAktualisieren(ereignis: MatDatepickerInputEvent<Date>): void {
    this.datum.set(ereignis.value ? lokalesDatumZuIso(ereignis.value) : '');
  }
}
