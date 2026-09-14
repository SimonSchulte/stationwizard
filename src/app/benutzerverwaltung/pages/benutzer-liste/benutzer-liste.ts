import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BenutzerZeile } from '../../components/benutzer-zeile/benutzer-zeile';
import { Hauptrolle, Sonderrolle } from '../../models/benutzerkonto.model';
import { BenutzerverwaltungStoreService } from '../../services/benutzerverwaltung-store.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-benutzer-liste',
  imports: [BenutzerZeile, MatIconModule, MatToolbarModule],
  templateUrl: './benutzer-liste.html',
  styleUrl: './benutzer-liste.less',
})
export class BenutzerListe implements OnInit {
  private readonly store = inject(BenutzerverwaltungStoreService);

  readonly benutzer = this.store.benutzer;
  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;
  readonly speichertFuer = this.store.speichertFuer;
  readonly speicherFehler = this.store.speicherFehler;

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  uebernehmen(
    email: string,
    entwurf: { rolle: Hauptrolle | null; sonderrollen: Sonderrolle[] },
  ): void {
    void this.store.rolleSetzen(email, entwurf.rolle, entwurf.sonderrollen);
  }
}
