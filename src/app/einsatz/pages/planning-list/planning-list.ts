import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe, formatDate } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { PlanungStoreService } from '../../services/planung-store.service';
import { SaveLoadService } from '../../services/save-load.service';
import { AppModeService } from '../../services/app-mode.service';
import { EfsApiService } from '../../services/efs-api.service';
import { ImportService } from '../../services/import.service';
import { ApiKeyDialog } from '../../components/api-key-dialog/api-key-dialog';
import { EfsEinsatz, EfsEinsatzGruppe } from '../../models/planung.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-planning-list',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MatToolbarModule,
  ],
  templateUrl: './planning-list.html',
  styleUrl: './planning-list.less',
})
export class PlanningList implements OnInit {
  private readonly store = inject(PlanungStoreService);
  private readonly router = inject(Router);
  private readonly saveLoad = inject(SaveLoadService);
  private readonly dialog = inject(MatDialog);
  readonly appMode = inject(AppModeService);
  private readonly efsApi = inject(EfsApiService);
  private readonly importService = inject(ImportService);

  readonly planungen = this.store.planungen;

  readonly efsEinsaetze = signal<EfsEinsatz[]>([]);
  readonly efsLoading = signal(false);
  readonly efsError = signal<string | null>(null);

  readonly efsGruppen = computed(() => this.efsApi.groupEinsaetze(this.efsEinsaetze()));

  readonly upcomingGruppen = computed(() =>
    this.efsGruppen().filter((g) => {
      const d = new Date(g.datum_bis);
      return isNaN(d.getTime()) || d >= new Date();
    }),
  );

  readonly pastGruppen = computed(() =>
    this.efsGruppen()
      .filter((g) => {
        const d = new Date(g.datum_bis);
        return !isNaN(d.getTime()) && d < new Date();
      })
      .sort((a, b) => new Date(b.datum_von).getTime() - new Date(a.datum_von).getTime()),
  );

  readonly einsatzColumns = ['titel', 'datum_von', 'datum_bis', 'ort'];

  ngOnInit(): void {
    if (this.appMode.mode() === 'connected-to-efs-api') {
      this.loadEfsEinsaetze();
    }
  }

  async loadEfsEinsaetze(): Promise<void> {
    this.efsLoading.set(true);
    this.efsError.set(null);
    try {
      const einsaetze = await this.efsApi.getVeranstaltungen();
      this.efsEinsaetze.set(einsaetze);
    } catch {
      this.efsError.set(
        'Fehler beim Laden der Veranstaltungen. Bitte API-Key prüfen und erneut versuchen.',
      );
    } finally {
      this.efsLoading.set(false);
    }
  }

  async openEfsGruppe(gruppe: EfsEinsatzGruppe): Promise<void> {
    this.store.openEfsGruppe(gruppe);
    this.router.navigate(['/einsatz/editor']);

    // Load details per Schicht in the background
    try {
      const results = await Promise.all(
        gruppe.schichten.map((s) => this.efsApi.getVeranstaltungDetail(s.id)),
      );
      for (let i = 0; i < gruppe.schichten.length; i++) {
        const schicht = gruppe.schichten[i];
        const detail = results[i];
        if (!detail) continue;
        const label = detail.zeitraum_bemerk ?? this.formatTimeRange(schicht);
        const fahrzeug =
          detail.einsatzmittel.length === 1
            ? this.efsApi.matchFahrzeug(detail.einsatzmittel[0])
            : null;
        this.store.addEfsSchichtPosten(schicht.id, label, fahrzeug);
        const mapped = detail.einsatzkraefte.map((ek) => this.importService.mapEfsEinsatzkraft(ek));
        this.store.mergeEfsEinsatzkraefte(mapped);
      }
    } catch {
      // Non-critical
    }
  }

  private formatTimeRange(schicht: EfsEinsatz): string {
    const fmt = (iso: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    return `${fmt(schicht.datum_von)}–${fmt(schicht.datum_bis)}`;
  }

  openPlanung(id: string): void {
    this.store.openPlanung(id);
    this.router.navigate(['/einsatz/editor']);
  }

  async loadFromFile(): Promise<void> {
    const result = await this.saveLoad.load();
    if (!result) return;
    if (result.versionWarning) {
      window.alert(
        'Versionswarnung: Die Datei wurde mit einer anderen Version gespeichert. Die Daten wurden trotzdem geladen, können aber unvollständig sein.',
      );
    }
    this.store.importPlanung(result.planung);
    this.router.navigate(['/einsatz/editor']);
  }

  createNew(): void {
    const name = `Neue Planung ${formatDate(new Date(), 'dd.MM.yyyy', 'de-DE')}`;
    this.store.createPlanung(name);
    this.router.navigate(['/einsatz/editor']);
  }

  openApiKeyDialog(): void {
    const ref = this.dialog.open(ApiKeyDialog, { width: '460px' });
    ref.afterClosed().subscribe(() => {
      if (this.appMode.mode() === 'connected-to-efs-api') {
        this.loadEfsEinsaetze();
      } else {
        this.efsEinsaetze.set([]);
      }
    });
  }
}
