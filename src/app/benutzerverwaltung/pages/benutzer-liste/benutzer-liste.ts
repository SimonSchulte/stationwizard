import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  HAUPTROLLEN,
  HAUPTROLLE_LABEL,
  Hauptrolle,
  SONDERROLLEN,
  SONDERROLLE_LABEL,
  Sonderrolle,
} from '../../models/benutzerkonto.model';
import { BenutzerverwaltungStoreService } from '../../services/benutzerverwaltung-store.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-benutzer-liste',
  imports: [
    DatePipe,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './benutzer-liste.html',
  styleUrl: './benutzer-liste.less',
})
export class BenutzerListe implements OnInit {
  private readonly store = inject(BenutzerverwaltungStoreService);

  readonly HAUPTROLLEN = HAUPTROLLEN;
  readonly HAUPTROLLE_LABEL = HAUPTROLLE_LABEL;
  readonly SONDERROLLEN = SONDERROLLEN;
  readonly SONDERROLLE_LABEL = SONDERROLLE_LABEL;

  readonly benutzer = this.store.benutzer;
  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;
  readonly speichertFuer = this.store.speichertFuer;
  readonly speicherFehler = this.store.speicherFehler;

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  hauptrolleAendern(email: string, sonderrollen: Sonderrolle[], neueRolle: Hauptrolle | ''): void {
    void this.store.rolleSetzen(email, neueRolle === '' ? null : neueRolle, sonderrollen);
  }

  sonderrolleUmschalten(
    email: string,
    rolle: Hauptrolle | null,
    sonderrollen: Sonderrolle[],
    sonderrolle: Sonderrolle,
    gesetzt: boolean,
  ): void {
    const aktualisiert = gesetzt
      ? [...sonderrollen, sonderrolle]
      : sonderrollen.filter((eintrag) => eintrag !== sonderrolle);
    void this.store.rolleSetzen(email, rolle, aktualisiert);
  }
}
