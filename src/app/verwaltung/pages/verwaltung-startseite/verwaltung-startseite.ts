import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import { FahrzeugDruckbogenService } from '../../../fahrzeuge/services/fahrzeug-druckbogen.service';
import { FahrzeugStoreService } from '../../../fahrzeuge/services/fahrzeug-store.service';

@Component({
  selector: 'app-verwaltung-startseite',
  imports: [RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './verwaltung-startseite.html',
  styleUrl: './verwaltung-startseite.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerwaltungStartseite {
  private readonly benutzerverwaltungStore = inject(BenutzerverwaltungStoreService);
  private readonly fahrzeugStore = inject(FahrzeugStoreService);
  private readonly druckbogenService = inject(FahrzeugDruckbogenService);

  /**
   * Nur eine Einblendregel für die Zugführung, kein Zugriffsschutz – der
   * Verwaltungsbereich kennt weiterhin kein durchgesetztes Rollenmodell
   * (siehe CLAUDE.md „Rechte vorerst alle, Rollen später“).
   */
  readonly istZugfuehrung = this.benutzerverwaltungStore.istZugfuehrung;

  readonly qrUebersichtLaedt = signal(false);
  readonly qrUebersichtFehler = signal('');

  constructor() {
    void this.benutzerverwaltungStore.listeLaden();
  }

  async qrUebersichtErstellen(): Promise<void> {
    if (!this.istZugfuehrung() || this.qrUebersichtLaedt()) return;
    this.qrUebersichtLaedt.set(true);
    this.qrUebersichtFehler.set('');
    try {
      await this.fahrzeugStore.listeLaden();
      const fahrzeuge = this.fahrzeugStore.fahrzeuge();
      if (fahrzeuge.length === 0) {
        this.qrUebersichtFehler.set('Es sind keine Fahrzeuge vorhanden.');
        return;
      }
      await this.druckbogenService.erzeugeUndSpeichereUebersicht(fahrzeuge);
    } catch (fehler) {
      this.qrUebersichtFehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Der Übersichtsbogen konnte nicht erstellt werden.',
      );
    } finally {
      this.qrUebersichtLaedt.set(false);
    }
  }
}
