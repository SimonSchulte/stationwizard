import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FuhrparkUebersicht } from '../../components/fuhrpark-uebersicht/fuhrpark-uebersicht';
import { WartungenListe } from '../../components/wartungen-liste/wartungen-liste';
import { FahrzeugListe } from '../fahrzeug-liste/fahrzeug-liste';
import { KilometerUebersicht } from '../kilometer-uebersicht/kilometer-uebersicht';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';

/**
 * Fuhrpark-Dashboard: Einstieg mit vier Tabs. „Übersicht" zeigt Kilometer-
 * und Wartungsdaten gemeinsam im Master/Detail (`FuhrparkUebersicht`) –
 * keine getrennten Kacheln mehr, jede Erfassung geschieht direkt dort. Die
 * übrigen Tabs bleiben eigenständige, schon vorhandene Ansichten.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-dashboard',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatToolbarModule,
    FuhrparkUebersicht,
    WartungenListe,
    FahrzeugListe,
    KilometerUebersicht,
  ],
  templateUrl: './fahrzeug-dashboard.html',
  styleUrl: './fahrzeug-dashboard.less',
})
export class FahrzeugDashboard implements OnInit {
  private readonly store = inject(FahrzeugStoreService);
  private readonly router = inject(Router);

  readonly fahrzeuge = this.store.fahrzeuge;
  readonly listeLaedt = this.store.listeLaedt;
  readonly listeFehler = this.store.listeFehler;

  readonly ausgewaehlterTab = signal(0);

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  neuesFahrzeug(): void {
    this.store.neuesFahrzeugBeginnen();
    void this.router.navigate(['/fahrzeuge/neu']);
  }
}
