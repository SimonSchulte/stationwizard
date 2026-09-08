import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { WorkerClient } from '../../../kern/worker-client';
import { LokaleDateiStorage, unterstuetztDateiZugriff } from '../../storage/lokale-datei.storage';
import { NextcloudWorkerStorage } from '../../storage/nextcloud-worker.storage';
import { WorkbookStorage } from '../../storage/workbook-storage';

/** Auswahl zwischen der zentralen Arbeitsmappe und einer lokalen Excel-Datei. */
@Component({
  selector: 'app-quelle-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatTabsModule],
  templateUrl: './quelle-dialog.html',
  styleUrl: './quelle-dialog.less',
})
export class QuelleDialog {
  private readonly dialogRef = inject(MatDialogRef<QuelleDialog, WorkbookStorage>);
  private readonly worker = inject(WorkerClient);

  readonly dateiZugriff = unterstuetztDateiZugriff();
  readonly fehler = signal('');

  dateiGewaehlt(event: Event): void {
    const datei = (event.target as HTMLInputElement).files?.[0];
    if (datei) {
      this.dialogRef.close(LokaleDateiStorage.ausDatei(datei));
    }
  }

  async dateiOeffnen(): Promise<void> {
    this.fehler.set('');
    try {
      this.dialogRef.close(await LokaleDateiStorage.auswaehlen());
    } catch (ursache) {
      if ((ursache as DOMException)?.name !== 'AbortError') {
        this.fehler.set(ursache instanceof Error ? ursache.message : String(ursache));
      }
    }
  }

  nextcloudVerbinden(): void {
    this.dialogRef.close(new NextcloudWorkerStorage(this.worker));
  }
}
