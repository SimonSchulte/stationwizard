import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { provideDeutschesDatum } from '../../../kern/kalender/deutsches-datum';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  isoZuLokalesDatum,
  lokalesDatumZuIso,
  lokalesDatumZuZeit,
  zeitZuLokalesDatum,
} from '../../../kern/kalender/datum';
import { Einsatz } from '../../models/einsatz.model';

/** Eingaben des Dialogs; Zeiten als lokale Berliner Zeit `YYYY-MM-DDTHH:mm`. */
export type EinsatzAnlegenDaten = Pick<Einsatz, 'titel' | 'beginn' | 'ende' | 'ort'>;

/** Kleiner Dialog für einen Einsatz ohne HiOrg-Veranstaltung: Titel, Zeitraum, Ort. */
@Component({
  selector: 'app-einsatz-anlegen-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatTimepickerModule,
  ],
  providers: [provideDeutschesDatum()],
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

  readonly beginnDatum = computed(() => this.datumVon(this.beginn()));
  readonly beginnZeit = computed(() => this.zeitVon(this.beginn()));
  readonly endeDatum = computed(() => this.datumVon(this.ende()));
  readonly endeZeit = computed(() => this.zeitVon(this.ende()));

  /** Übernimmt ein gewähltes Datum; ohne Uhrzeit beginnt der Tag um 00:00. */
  datumGeaendert(feld: 'beginn' | 'ende', wert: Date | null): void {
    const ziel = this[feld];
    if (!wert) {
      ziel.set('');
      return;
    }
    const datum = lokalesDatumZuIso(wert);
    const zeit = ziel().slice(11, 16) || '00:00';
    const neu = `${datum}T${zeit}`;
    // Der Datepicker meldet auch die erste Zuweisung; gleiche Werte nicht erneut setzen.
    if (neu !== ziel()) ziel.set(neu);
  }

  zeitGeaendert(feld: 'beginn' | 'ende', wert: Date | null): void {
    const ziel = this[feld];
    if (!wert || !ziel()) return;
    const neu = `${ziel().slice(0, 10)}T${lokalesDatumZuZeit(wert)}`;
    if (neu !== ziel()) ziel.set(neu);
  }

  private datumVon(wert: string): Date | null {
    return wert ? isoZuLokalesDatum(wert.slice(0, 10)) : null;
  }

  private zeitVon(wert: string): Date | null {
    return wert ? zeitZuLokalesDatum(wert.slice(11, 16)) : null;
  }

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
