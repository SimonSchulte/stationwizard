import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppModeService } from '../../services/app-mode.service';
import { EfsApiService } from '../../services/efs-api.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-api-key-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './api-key-dialog.html',
  styleUrl: './api-key-dialog.less',
})
export class ApiKeyDialog {
  private readonly dialogRef = inject(MatDialogRef<ApiKeyDialog>);
  private readonly efsApi = inject(EfsApiService);
  readonly appMode = inject(AppModeService);

  readonly apiKey = signal(this.appMode.apiKey() ?? '');
  readonly validating = signal(false);
  readonly validationError = signal<string | null>(null);
  readonly validationSuccess = signal<string | null>(null);

  async save(): Promise<void> {
    const key = this.apiKey().trim();
    if (!key) return;

    this.validating.set(true);
    this.validationError.set(null);
    this.validationSuccess.set(null);

    try {
      const result = await this.efsApi.checkApiKey(key);
      this.appMode.setApiKey(key);
      this.dialogRef.close(result);
    } catch (err) {
      this.validationError.set(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    } finally {
      this.validating.set(false);
    }
  }

  remove(): void {
    this.appMode.setApiKey(null);
    this.dialogRef.close();
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
