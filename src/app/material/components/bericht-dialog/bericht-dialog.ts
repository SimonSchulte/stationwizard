import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { ApiCheckStorage } from '../../storage/api-check-storage';
import {
  BERICHTSART_ERKLAERUNG,
  BERICHTSART_TITEL,
  BERICHTSARTEN,
  Berichtsart,
} from '../../storage/check-storage';

export interface BerichtDialogDaten {
  checkId: string;
  behaelterBezeichnung: string;
  geprueftAm: string;
}

/**
 * Vorschau und Versand der Berichte zu einem Check.
 *
 * Der Text kommt vom Worker, nicht aus einer zweiten Fassung der
 * Berichtslogik im Browser – so zeigen Vorschau und Mail nachweislich
 * dasselbe. Geladen wird er erst beim Öffnen des Dialogs; ungesehene Inhalte
 * kosten sonst unnötige Worker-Anfragen.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-bericht-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './bericht-dialog.html',
  styleUrl: './bericht-dialog.less',
})
export class BerichtDialog {
  private readonly storage = inject(ApiCheckStorage);
  private readonly dialogRef = inject(MatDialogRef<BerichtDialog>);
  readonly daten = inject<BerichtDialogDaten>(MAT_DIALOG_DATA);

  readonly arten = BERICHTSARTEN;
  readonly titel = BERICHTSART_TITEL;
  readonly erklaerung = BERICHTSART_ERKLAERUNG;

  readonly gewaehlt = signal<Berichtsart | null>(null);
  readonly text = signal('');
  readonly laedt = signal(false);
  readonly fehler = signal('');

  readonly empfaenger = signal('');
  readonly sendet = signal(false);
  readonly gesendetAn = signal('');
  readonly kopiert = signal(false);

  async waehle(art: Berichtsart): Promise<void> {
    this.gewaehlt.set(art);
    this.text.set('');
    this.fehler.set('');
    this.gesendetAn.set('');
    this.laedt.set(true);
    try {
      this.text.set(await this.storage.ladeBericht(this.daten.checkId, art));
    } catch (ursache) {
      this.fehler.set(
        ursache instanceof Error ? ursache.message : 'Der Bericht konnte nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  zurueck(): void {
    this.gewaehlt.set(null);
    this.text.set('');
    this.fehler.set('');
    this.gesendetAn.set('');
  }

  async kopieren(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
      this.kopiert.set(true);
      setTimeout(() => this.kopiert.set(false), 2000);
    } catch {
      this.fehler.set('Das Kopieren hat der Browser abgelehnt. Der Text lässt sich markieren.');
    }
  }

  herunterladen(): void {
    const art = this.gewaehlt();
    if (!art) return;
    const name = `${this.titel[art]}_${this.daten.behaelterBezeichnung}_${this.daten.geprueftAm}`
      .replace(/[^\wÄÖÜäöüß.-]+/g, '-')
      .replace(/-+/g, '-');
    dateiHerunterladen(this.text(), `${name}.txt`, 'text/plain;charset=utf-8');
  }

  async senden(): Promise<void> {
    const art = this.gewaehlt();
    if (!art) return;
    this.sendet.set(true);
    this.fehler.set('');
    this.gesendetAn.set('');
    try {
      const bestaetigung = await this.storage.sendeBericht(
        this.daten.checkId,
        art,
        this.empfaenger().trim(),
      );
      this.gesendetAn.set(bestaetigung.gesendetAn);
    } catch (ursache) {
      this.fehler.set(
        ursache instanceof Error ? ursache.message : 'Der Versand ist fehlgeschlagen.',
      );
    } finally {
      this.sendet.set(false);
    }
  }

  schliessen(): void {
    this.dialogRef.close();
  }
}
