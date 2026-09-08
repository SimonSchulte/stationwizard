import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { DatePipe, formatDate } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { PlanungStoreService } from '../../services/planung-store.service';
import { PlanungCloudService } from '../../services/planung-cloud.service';
import { SaveLoadService } from '../../services/save-load.service';
import { EfsApiService } from '../../services/efs-api.service';
import { ImportService } from '../../services/import.service';
import { EfsEinsatz, EfsEinsatzGruppe } from '../../models/planung.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-planning-list',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
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
  private readonly dialogDienst = inject(DialogDienst);
  private readonly saveLoad = inject(SaveLoadService);
  readonly efsApi = inject(EfsApiService);
  private readonly importService = inject(ImportService);

  readonly planungen = this.store.planungen;
  readonly cloud = inject(PlanungCloudService);
  readonly cloudLadeId = signal<string | null>(null);
  readonly cloudFehler = signal('');

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
    void this.cloud.listeLaden();
    void this.loadEfsEinsaetze();
  }

  async cloudPlanungLaden(id: string): Promise<void> {
    if (this.cloudLadeId()) return;
    const kontextId = this.store.active()?.id;
    const lokalerStand = () => {
      const planung = this.planungen().find((eintrag) => eintrag.id === id);
      return planung ? JSON.stringify(planung) : null;
    };
    const kontextUnveraendert = () => this.store.active()?.id === kontextId;
    let bestaetigterStand = lokalerStand();
    this.cloudLadeId.set(id);
    this.cloudFehler.set('');
    try {
      const lokal = this.planungen().find((planung) => planung.id === id);
      if (lokal && this.cloud.hatLokaleAenderungen(lokal)) {
        if (
          !(await this.dialogDienst.bestaetigen(
            'Diese Planung enthält lokale Änderungen. Den gespeicherten Stand laden und die lokalen Änderungen ersetzen? Zur Sicherung kannst du zuerst im Editor JSON herunterladen.',
            'Lokale Änderungen ersetzen',
            'Gespeicherten Stand laden',
          ))
        )
          return;
        if (!kontextUnveraendert()) return;
        if (lokalerStand() !== bestaetigterStand)
          throw new Error(
            'Die Planung wurde während der Bestätigung geändert. Bitte erneut laden.',
          );
      }
      const ergebnis = await this.cloud.laden(id);
      if (!kontextUnveraendert()) return;
      if (lokalerStand() !== bestaetigterStand) {
        bestaetigterStand = lokalerStand();
        if (
          !(await this.dialogDienst.bestaetigen(
            'Die lokale Planung wurde während des Ladens geändert. Trotzdem durch den gespeicherten Stand ersetzen?',
            'Geänderte Planung ersetzen',
            'Ersetzen',
          ))
        )
          return;
        if (!kontextUnveraendert()) return;
        if (lokalerStand() !== bestaetigterStand)
          throw new Error('Die Planung wurde erneut geändert. Bitte erneut laden.');
      }
      if (ergebnis.versionWarning) {
        if (
          !(await this.dialogDienst.bestaetigen(
            'Der Einsatzplan wurde mit einer anderen Dateiversion gespeichert. Trotzdem laden?',
            'Versionswarnung',
            'Laden',
          ))
        )
          return;
      }
      if (!kontextUnveraendert()) return;
      if (lokalerStand() !== bestaetigterStand)
        throw new Error('Die Planung wurde inzwischen geändert. Bitte erneut laden.');
      this.store.importPlanung(ergebnis.planung);
      this.store.openPlanung(ergebnis.planung.id);
      this.cloud.uebernahmeMerken(ergebnis);
      await this.router.navigate(['/einsatz/editor']);
    } catch (fehler) {
      this.cloudFehler.set(this.cloud.fehlermeldung(fehler));
    } finally {
      this.cloudLadeId.set(null);
    }
  }

  async loadEfsEinsaetze(): Promise<void> {
    this.efsLoading.set(true);
    this.efsError.set(null);
    try {
      const einsaetze = await this.efsApi.getVeranstaltungen();
      this.efsEinsaetze.set(einsaetze);
    } catch (fehler) {
      this.efsError.set(
        fehler instanceof Error
          ? fehler.message
          : 'Die Veranstaltungen konnten nicht geladen werden.',
      );
    } finally {
      this.efsLoading.set(false);
    }
  }

  async openEfsGruppe(gruppe: EfsEinsatzGruppe): Promise<void> {
    const zielId = this.store.openEfsGruppe(gruppe).id;
    this.router.navigate(['/einsatz/editor']);

    // Load details per Schicht in the background
    try {
      const results = await Promise.all(
        gruppe.schichten.map((s) => this.efsApi.getVeranstaltungDetail(s.id)),
      );
      if (this.store.active()?.id !== zielId) return;
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
    } catch (fehler) {
      this.efsApi.fehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Einsatzdetails konnten nicht geladen werden. Bitte im Editor erneut aktualisieren.',
      );
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
    const kontext = this.store.active();
    const result = await this.saveLoad.load();
    if (!result || this.store.active() !== kontext) return;
    if (result.versionWarning) {
      await this.dialogDienst.hinweis(
        'Versionswarnung: Die Datei wurde mit einer anderen Version gespeichert. Die Daten wurden trotzdem geladen, können aber unvollständig sein.',
      );
    }
    if (this.store.active() !== kontext) return;
    this.store.importPlanung(result.planung);
    this.router.navigate(['/einsatz/editor']);
  }

  createNew(): void {
    const name = `Neue Planung ${formatDate(new Date(), 'dd.MM.yyyy', 'de-DE')}`;
    this.store.createPlanung(name);
    this.router.navigate(['/einsatz/editor']);
  }
}
