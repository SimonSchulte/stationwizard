import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { VerlassenSchutz } from '../../../kern/verlassen-schutz';
import {
  HIORG_VERBINDEN_ADRESSE,
  HiorgPersonalService,
  type HiorgPerson,
} from '../../services/hiorg-personal.service';
import { ImportService } from '../../services/import.service';
import { PlanungStoreService } from '../../services/planung-store.service';

/** Übernahme von Personen aus der HiOrg-Server-API in den Helferpool der aktiven Planung. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hiorg-personal-dialog',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './hiorg-personal-dialog.html',
  styleUrl: './hiorg-personal-dialog.less',
})
export class HiorgPersonalDialog {
  private readonly hiorg = inject(HiorgPersonalService);
  private readonly importService = inject(ImportService);
  private readonly store = inject(PlanungStoreService);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly verlassenSchutz = inject(VerlassenSchutz);
  private readonly dokument = inject(DOCUMENT);
  readonly dialogRef = inject(MatDialogRef<HiorgPersonalDialog>);

  readonly verbindung = this.hiorg.verbindung;
  readonly laedt = signal(false);
  readonly fehler = signal('');
  readonly personen = signal<HiorgPerson[]>([]);
  readonly suche = signal('');
  readonly auswahl = signal<ReadonlySet<string>>(new Set());

  private readonly vorhandeneNamen = computed(
    () => new Set((this.store.active()?.einsatzkraefte ?? []).map((e) => e.name)),
  );

  readonly gefiltert = computed(() => {
    const suche = this.suche().trim().toLocaleLowerCase('de');
    if (!suche) return this.personen();
    return this.personen().filter((person) =>
      [person.nachname, person.vorname, ...person.gruppen].some((teil) =>
        teil.toLocaleLowerCase('de').includes(suche),
      ),
    );
  });

  readonly anzahlAuswahl = computed(() => this.auswahl().size);

  constructor() {
    void this.laden();
  }

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      if ((await this.hiorg.verbindungLaden()) === 'verbunden') {
        this.personen.set(await this.hiorg.personalLaden());
      }
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Der HiOrg-Server ist nicht erreichbar.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  qualifikationen(person: HiorgPerson): string {
    return person.qualifikationen
      .map((q) => q.kurz || q.name)
      .filter(Boolean)
      .join(', ');
  }

  schonVorhanden(person: HiorgPerson): boolean {
    return this.vorhandeneNamen().has(`${person.nachname} ${person.vorname}`.trim());
  }

  umschalten(person: HiorgPerson, gewaehlt: boolean): void {
    this.auswahl.update((alt) => {
      const neu = new Set(alt);
      if (gewaehlt) neu.add(person.id);
      else neu.delete(person.id);
      return neu;
    });
  }

  alleSichtbarenWaehlen(): void {
    this.auswahl.update((alt) => {
      const neu = new Set(alt);
      for (const person of this.gefiltert()) {
        if (!this.schonVorhanden(person)) neu.add(person.id);
      }
      return neu;
    });
  }

  uebernehmen(): void {
    if (!this.store.active()) return;
    const gewaehlt = this.personen().filter((person) => this.auswahl().has(person.id));
    this.store.mergeEfsEinsatzkraefte(gewaehlt.map((p) => this.importService.mapHiorgPerson(p)));
    this.dialogRef.close();
  }

  async verbinden(): Promise<void> {
    // Die Anmeldung bei HiOrg verlässt die Seite; ungesicherte Planungen gingen verloren.
    if (
      this.verlassenSchutz.hatUngesicherteAenderungen() &&
      !(await this.dialogDienst.bestaetigen(
        'Für die Anmeldung beim HiOrg-Server wird die Seite verlassen. Ungesicherte Änderungen gehen dabei verloren. Bitte vorher speichern oder eine Kopie herunterladen.',
        'Mit HiOrg-Server verbinden',
        'Trotzdem verbinden',
      ))
    ) {
      return;
    }
    this.dokument.location.assign(HIORG_VERBINDEN_ADRESSE);
  }

  async trennen(): Promise<void> {
    this.fehler.set('');
    try {
      await this.hiorg.trennen();
      this.personen.set([]);
      this.auswahl.set(new Set());
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Die Verbindung konnte nicht getrennt werden.',
      );
    }
  }
}
