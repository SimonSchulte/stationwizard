import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import { FahrzeugDruckbogenService } from '../../../fahrzeuge/services/fahrzeug-druckbogen.service';
import { ApiErfassungslinkStorage } from '../../../fahrzeuge/storage/api-erfassungslink-storage';

@Component({
  selector: 'app-verwaltung-startseite',
  imports: [RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './verwaltung-startseite.html',
  styleUrl: './verwaltung-startseite.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerwaltungStartseite {
  private readonly benutzerverwaltungStore = inject(BenutzerverwaltungStoreService);
  private readonly linkStorage = inject(ApiErfassungslinkStorage);
  private readonly druckbogenService = inject(FahrzeugDruckbogenService);

  /**
   * Einblendregel für Zugführung und Gruppenführungen, kein Zugriffsschutz. Die
   * eigentliche Begrenzung geschieht serverseitig: `/api/fahrzeuge/erfassungslinks`
   * liefert nur die Gruppen, für die die Person freigeben darf – ohne passende
   * Rolle eine leere Liste.
   */
  readonly darfFreigeben = this.benutzerverwaltungStore.darfFreigeben;

  readonly qrUebersichtLaedt = signal(false);
  readonly qrUebersichtFehler = signal('');

  constructor() {
    void this.benutzerverwaltungStore.listeLaden();
  }

  async qrUebersichtErstellen(art: 'intern' | 'oeffentlich'): Promise<void> {
    if (!this.darfFreigeben() || this.qrUebersichtLaedt()) return;
    this.qrUebersichtLaedt.set(true);
    this.qrUebersichtFehler.set('');
    try {
      const links = await this.linkStorage.ladeLinks();
      if (links.length === 0) {
        this.qrUebersichtFehler.set(
          'Es sind keine Fahrzeuge vorhanden, für die du freigeben darfst.',
        );
        return;
      }
      await this.druckbogenService.erzeugeUndSpeichereUebersicht(links, art);
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
