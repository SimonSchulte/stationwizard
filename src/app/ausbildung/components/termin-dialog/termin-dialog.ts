import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DATE_LOCALE, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import {
  isoZuLokalesDatum,
  lokalesDatumZuIso,
  lokalesDatumZuZeit,
  zeitZuLokalesDatum,
} from '../../../kern/kalender/datum';
import {
  KATEGORIEN,
  TERMIN_TYPEN,
  Termin,
  TerminTyp,
  leererTermin,
  typName,
} from '../../models/plan.model';
import { PlanStore } from '../../services/plan-store';

export interface TerminDialogDaten {
  /** Vorhandenen Eintrag bearbeiten … */
  terminId?: string;
  /** … oder einen neuen für dieses Datum anlegen (`null` = neue Idee). */
  datum?: string | null;
}

/**
 * Öffnet den Termin-Dialog: auf schmalen Displays als Vollbild, sonst als 760 px breites
 * Fenster. Die Seiten rufen nur diese Funktion, damit beide Wege gleich aussehen.
 */
export function oeffneTerminDialog(dialog: MatDialog, daten: TerminDialogDaten): void {
  const schmal =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 600px)').matches;
  dialog.open(TerminDialog, {
    data: daten,
    ...(schmal
      ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh' }
      : { width: '760px', maxWidth: '94vw' }),
  });
}

/** Bearbeitet einen Termin oder eine Idee – dasselbe Formular für beide. */
@Component({
  selector: 'app-termin-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatSelectModule,
    MatTimepickerModule,
    MatTooltipModule,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'de-DE' }],
  templateUrl: './termin-dialog.html',
  styleUrl: './termin-dialog.less',
})
export class TerminDialog {
  private readonly store = inject(PlanStore);
  private readonly dialogRef = inject(MatDialogRef<TerminDialog>);
  private readonly daten = inject<TerminDialogDaten>(MAT_DIALOG_DATA);
  private readonly dialogDienst = inject(DialogDienst);

  readonly kategorien = KATEGORIEN;
  readonly terminTypen = TERMIN_TYPEN;
  readonly typName = typName;
  readonly katsThemen = this.store.katsThemen;

  private readonly vorhanden = this.daten.terminId
    ? this.store.terminNachId(this.daten.terminId)
    : undefined;

  readonly istNeu = this.vorhanden === undefined;
  readonly entwurf = signal<Termin>(
    this.vorhanden
      ? structuredClone(this.vorhanden)
      : // Was neu eingetragen wird, ist standardmäßig ein „Termin“; ein „Dienst“ wird bewusst gewählt.
        { ...leererTermin(this.daten.datum ?? null), typ: 'termin' },
  );
  /** Stand beim Öffnen, um ungesicherte Eingaben zu erkennen. */
  private readonly ausgangsstand = JSON.stringify(this.entwurf());
  readonly geaendert = computed(() => JSON.stringify(this.entwurf()) !== this.ausgangsstand);
  /** „Weitere Angaben“ stehen offen, sobald dort schon etwas erfasst ist. */
  readonly weitereOffen = [
    this.entwurf().material,
    this.entwurf().anforderungen,
    this.entwurf().notizen,
    this.entwurf().hgmInhalt,
    this.entwurf().hgmTitel,
  ].some((t) => t.trim() !== '');
  readonly istIdee = computed(() => this.entwurf().datum === null);

  /** Stabile `Date`-Referenzen für die Picker: nur bei geändertem Wert neu erzeugt. */
  private static readonly gleich = (a: Date | null, b: Date | null) =>
    a?.getTime() === b?.getTime();
  readonly datumWert = computed(() => isoZuLokalesDatum(this.entwurf().datum ?? ''), {
    equal: TerminDialog.gleich,
  });
  readonly datumBisWert = computed(() => isoZuLokalesDatum(this.entwurf().datumBis ?? ''), {
    equal: TerminDialog.gleich,
  });
  readonly beginnWert = computed(() => zeitZuLokalesDatum(this.entwurf().beginnZeit), {
    equal: TerminDialog.gleich,
  });
  readonly endeWert = computed(() => zeitZuLokalesDatum(this.entwurf().endeZeit), {
    equal: TerminDialog.gleich,
  });
  /**
   * Fehlerhafte Eingaben blockieren das Speichern, statt still einen
   * unbrauchbaren Zeitraum in die Mappe zu schreiben.
   */
  readonly endeVorBeginn = computed(() => {
    const e = this.entwurf();
    return e.datum !== null && e.datumBis !== null && e.datumBis < e.datum;
  });
  readonly zeitVerdreht = computed(() => {
    const e = this.entwurf();
    // Nur bei eintägigen Terminen aussagekräftig: über Nacht darf „Bis" früher sein.
    return (
      e.datumBis === null && e.beginnZeit !== '' && e.endeZeit !== '' && e.endeZeit < e.beginnZeit
    );
  });
  readonly kannSpeichern = computed(() => !this.endeVorBeginn());

  readonly kannAlsKatsThema = computed(() => {
    const e = this.entwurf();
    return !e.katsThemaId && (e.katsTitel.trim() || e.thema.trim()).length > 0;
  });

  constructor() {
    // Esc und Klick auf den Hintergrund schließen nicht mehr still, wenn Eingaben offen sind.
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick().subscribe(() => void this.abbrechen());
    this.dialogRef
      .keydownEvents()
      .pipe(filter((e) => e.key === 'Escape'))
      .subscribe(() => void this.abbrechen());
  }

  async abbrechen(): Promise<void> {
    if (
      this.geaendert() &&
      !(await this.dialogDienst.bestaetigen(
        'Die Eingaben in diesem Formular gehen verloren.',
        'Änderungen verwerfen?',
        'Verwerfen',
      ))
    ) {
      return;
    }
    this.dialogRef.close(false);
  }

  setze<K extends keyof Termin>(feld: K, wert: Termin[K]): void {
    this.entwurf.update((e) => ({ ...e, [feld]: wert }));
  }

  waehleKatsThema(id: string | null): void {
    const thema = this.katsThemen().find((t) => t.id === id);
    this.entwurf.update((e) => ({
      ...e,
      katsThemaId: thema?.id ?? null,
      katsTitel: thema?.titel ?? e.katsTitel,
      katsPflicht: thema ? true : e.katsPflicht,
    }));
  }

  /** Legt den aktuellen Titel als neues KatS-Thema an und verknüpft ihn sofort. */
  alsKatsThemaAnlegen(): void {
    const e = this.entwurf();
    const titel = (e.katsTitel || e.thema).replace(/\s+/g, ' ').trim();
    if (!titel) {
      return;
    }
    const id = this.store.neuesKatsThema({ titel });
    this.waehleKatsThema(id);
  }

  setzeTyp(typ: TerminTyp): void {
    this.setze('typ', typ);
  }

  /** Ein leeres oder ungültiges Datum behält den bisherigen Wert. */
  datumAktualisieren(ereignis: MatDatepickerInputEvent<Date>): void {
    if (!ereignis.value) return;
    const datum = lokalesDatumZuIso(ereignis.value);
    if (datum !== this.entwurf().datum) this.setze('datum', datum);
  }

  /** Leeres Datumsfeld heißt „eintägig", nicht „ungültig". */
  datumBisAktualisieren(ereignis: MatDatepickerInputEvent<Date>): void {
    const datumBis = ereignis.value ? lokalesDatumZuIso(ereignis.value) : null;
    if (datumBis !== this.entwurf().datumBis) this.setze('datumBis', datumBis);
  }

  /** Leere Zeit heißt „ohne Uhrzeit"; der Timepicker meldet auch die Erstzuweisung. */
  zeitAktualisieren(feld: 'beginnZeit' | 'endeZeit', wert: Date | null): void {
    const zeit = wert ? lokalesDatumZuZeit(wert) : '';
    if (zeit !== this.entwurf()[feld]) this.setze(feld, zeit);
  }

  speichern(): void {
    if (!this.kannSpeichern()) {
      return;
    }
    const entwurf = this.entwurf();
    if (this.istNeu) {
      this.store.fuegeTerminEin(entwurf);
    } else {
      const { id, ...aenderung } = entwurf;
      this.store.aktualisiereTermin(id, aenderung);
    }
    this.dialogRef.close(true);
  }
}
