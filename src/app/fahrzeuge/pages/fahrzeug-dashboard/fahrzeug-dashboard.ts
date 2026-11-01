import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FuhrparkUebersicht } from '../../components/fuhrpark-uebersicht/fuhrpark-uebersicht';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';

/**
 * Fuhrpark-Dashboard: die Fahrzeugseite selbst, ohne Tab-Umwege. Kilometer-
 * und Wartungsdaten stehen gemeinsam im Master/Detail (`FuhrparkUebersicht`).
 * „Liste Fahrzeuge", „Liste Wartungen" und „Kilometerübersicht" standen
 * zuvor als eigene Tabs hier; ihre Funktion deckt das Master/Detail
 * inzwischen weitgehend ab, die Tab-Fassung entfällt deshalb erstmal. Die
 * einzelnen Seiten/Komponenten bleiben erhalten und über ihre eigenen Routen
 * erreichbar.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-dashboard',
  imports: [
    Leerzustand,
    Meldung,
    Ladeanzeige,
    Seitenkopf,
    MatButtonModule,
    MatIconModule,
    FuhrparkUebersicht,
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

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  neuesFahrzeug(): void {
    this.store.neuesFahrzeugBeginnen();
    void this.router.navigate(['/fahrzeuge/neu']);
  }
}
