import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TextFieldModule } from '@angular/cdk/text-field';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { ImportService } from '../../services/import.service';
import { PlanungStoreService } from '../../services/planung-store.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-import-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    TextFieldModule,
  ],
  templateUrl: './import-dialog.html',
  styleUrl: './import-dialog.less',
})
export class ImportDialog {
  private readonly importService = inject(ImportService);
  private readonly store = inject(PlanungStoreService);
  private readonly dialogDienst = inject(DialogDienst);
  private importLaeuft = false;
  readonly dialogRef = inject(MatDialogRef<ImportDialog>);

  readonly inputText = signal('');
  readonly mergeMode = signal(false);

  readonly parsed = computed(() => this.importService.parseRoster(this.inputText()));
  readonly parseCount = computed(() => this.parsed().length);

  readonly existingCount = computed(() => this.store.active()?.einsatzkraefte.length ?? 0);

  readonly removedNames = computed(() => {
    if (this.mergeMode() || !this.store.active()) return [];
    const incomingNames = new Set(this.parsed().map((e) => e.name));
    return (this.store.active()?.einsatzkraefte ?? [])
      .filter((e) => !incomingNames.has(e.name))
      .map((e) => e.name);
  });

  async doImport(): Promise<void> {
    if (this.importLaeuft) return;
    const ziel = this.store.active();
    if (!ziel) return;
    const daten = this.parsed();
    const mode = this.mergeMode() ? 'merge' : 'replace';
    const affected = this.removedNames().filter((name) =>
      this.store
        .active()
        ?.posten.some((p) => p.positions.some((pos) => pos.assigned?.name === name)),
    );

    this.importLaeuft = true;
    try {
      if (mode === 'replace' && affected.length > 0) {
        const nachricht = `Folgende Personen sind noch zugeteilt und werden entfernt:\n${affected.join(', ')}\n\nFortfahren?`;
        if (!(await this.dialogDienst.bestaetigen(nachricht, 'Einsatzkräfte ersetzen', 'Ersetzen')))
          return;
      }
      if (this.store.active() !== ziel) {
        await this.dialogDienst.hinweis(
          'Die Planung wurde inzwischen geändert. Bitte prüfe die Einsatzkräfte und starte den Import erneut.',
        );
        return;
      }
      this.store.importRoster(daten, mode);
      this.dialogRef.close();
    } finally {
      this.importLaeuft = false;
    }
  }
}
