import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { VbAenderung, VbAenderungArt } from '../../services/vb-abgleich';

export interface VorlageAbgleichDialogDaten {
  /** Bezeichnung der Quelle, etwa der Einsatztitel („die Vorbereitung für …“). */
  vorbereitung: string;
  vorlageTitel: string;
  vorlageVersion: number | null;
  aenderungen: readonly VbAenderung[];
}

const ART_BEZEICHNUNG: Record<VbAenderungArt, string> = {
  geaendert: 'geändert',
  neu: 'neu',
  geloescht: 'gelöscht',
};

/**
 * Dialog „Änderungen auf Vorlage anwenden?“: je Abweichung ein Ankreuzfeld (Löschungen sind
 * vorab nicht gewählt). Schließt mit den gewählten Schlüsseln; angewendet wird auf der Seite
 * über den Store, der die Vorlage dazu frisch lädt und mit `If-Match` speichert.
 */
@Component({
  selector: 'app-vorlage-abgleich-dialog',
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule],
  templateUrl: './vorlage-abgleich-dialog.html',
  styleUrl: './vorlage-abgleich-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VorlageAbgleichDialog {
  protected readonly daten = inject<VorlageAbgleichDialogDaten>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<VorlageAbgleichDialog, string[]>>(MatDialogRef);

  protected readonly artBezeichnung = ART_BEZEICHNUNG;

  protected readonly gewaehlt = signal<ReadonlySet<string>>(
    new Set(this.daten.aenderungen.filter((a) => a.standardGewaehlt).map((a) => a.schluessel)),
  );
  protected readonly anzahl = computed(() => this.gewaehlt().size);

  protected umschalten(schluessel: string, gewaehlt: boolean): void {
    this.gewaehlt.update((alt) => {
      const neu = new Set(alt);
      if (gewaehlt) neu.add(schluessel);
      else neu.delete(schluessel);
      return neu;
    });
  }

  protected uebernehmen(): void {
    const gewaehlt = this.gewaehlt();
    this.dialogRef.close(
      this.daten.aenderungen.map((a) => a.schluessel).filter((s) => gewaehlt.has(s)),
    );
  }
}
