import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';
import type { EfsEinsatzkraft } from '../../models/efs.model';
import type { EfsKandidat } from '../../services/efs-abgleich';
import { EfsQuelle } from '../../services/efs-quelle.service';
import { KuerzelAvatar } from '../kuerzel-avatar/kuerzel-avatar';

export interface EfsTrefferDialogDaten {
  titel: string;
  /** Beginn lokal `YYYY-MM-DDTHH:mm`, nur zur Anzeige. */
  beginn: string | null;
  kandidaten: readonly EfsKandidat[];
}

/** `string`: gewählte EFS-Veranstaltung, `null`: keine davon. Abbrechen schließt ohne Wert. */
export type EfsTrefferErgebnis = string | null;

const KEINER = '__keiner__';

/** Öffnet den Dialog; `undefined` bei Abbruch, sonst die gewählte Veranstaltung oder `null`. */
export function efsTrefferWaehlen(
  dialog: MatDialog,
  daten: EfsTrefferDialogDaten,
): Promise<EfsTrefferErgebnis | undefined> {
  return firstValueFrom(
    dialog
      .open<EfsTrefferDialog, EfsTrefferDialogDaten, EfsTrefferErgebnis>(EfsTrefferDialog, {
        width: '640px',
        maxWidth: '94vw',
        data: daten,
      })
      .afterClosed(),
    { defaultValue: undefined },
  );
}

/**
 * Lässt bei einem mehrdeutigen EFS-Abgleich den passenden Einsatz wählen und zeigt vorab, wessen
 * Personal er mitbringt. Die Vorschau holt die Einsatzkräfte erst, wenn ein Kandidat gewählt ist.
 */
@Component({
  selector: 'app-efs-treffer-dialog',
  imports: [
    KuerzelAvatar,
    Ladeanzeige,
    Meldung,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatRadioModule,
  ],
  templateUrl: './efs-treffer-dialog.html',
  styleUrl: './efs-treffer-dialog.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EfsTrefferDialog {
  protected readonly daten = inject<EfsTrefferDialogDaten>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EfsTrefferDialog, EfsTrefferErgebnis>);
  private readonly quelle = inject(EfsQuelle);

  protected readonly KEINER = KEINER;
  protected readonly gewaehlt = signal<string>(
    this.daten.kandidaten[0]?.gruppe.veranstaltung_id ?? KEINER,
  );
  protected readonly vorschau = signal<EfsEinsatzkraft[] | null>(null);
  protected readonly vorschauFehler = signal('');
  protected readonly vorschauLaedt = signal(false);
  protected readonly erste = computed(() => (this.vorschau() ?? []).slice(0, 3));
  protected readonly weitere = computed(() => Math.max(0, (this.vorschau()?.length ?? 0) - 3));

  /** Nur die jüngste Anfrage darf die Vorschau setzen (schnelles Umschalten). */
  private anfrage = 0;

  constructor() {
    void this.vorschauLaden();
  }

  protected waehlen(id: string): void {
    this.gewaehlt.set(id);
    void this.vorschauLaden();
  }

  protected datum(wert: string): string {
    const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(wert);
    return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : wert;
  }

  protected prozent(kandidat: EfsKandidat): string {
    return `${Math.round(kandidat.titelAehnlichkeit * 100)} %`;
  }

  protected bestaetigen(): void {
    this.dialogRef.close(this.gewaehlt() === KEINER ? null : this.gewaehlt());
  }

  private async vorschauLaden(): Promise<void> {
    const id = this.gewaehlt();
    const kandidat = this.daten.kandidaten.find((k) => k.gruppe.veranstaltung_id === id);
    const meine = ++this.anfrage;
    this.vorschau.set(null);
    this.vorschauFehler.set('');
    if (!kandidat) {
      this.vorschauLaedt.set(false);
      return;
    }
    this.vorschauLaedt.set(true);
    try {
      const personal = await this.quelle.personalLaden(kandidat.gruppe);
      if (meine === this.anfrage) this.vorschau.set(personal);
    } catch (fehler) {
      if (meine === this.anfrage) {
        this.vorschauFehler.set(
          fehler instanceof Error ? fehler.message : 'Das Personal konnte nicht geladen werden.',
        );
      }
    } finally {
      if (meine === this.anfrage) this.vorschauLaedt.set(false);
    }
  }
}
