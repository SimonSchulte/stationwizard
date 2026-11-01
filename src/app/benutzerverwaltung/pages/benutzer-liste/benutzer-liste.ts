import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { anzeigenameAusEmail } from '../../../kern/text/anzeigename';
import { BenutzerZeile } from '../../components/benutzer-zeile/benutzer-zeile';
import { Hauptrolle, Sonderrolle } from '../../models/benutzerkonto.model';
import { BenutzerverwaltungStoreService } from '../../services/benutzerverwaltung-store.service';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-benutzer-liste',
  imports: [
    Suchfeld,
    Leerzustand,
    Meldung,
    Ladeanzeige,
    Seitenkopf,
    BenutzerZeile,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
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

  readonly suche = signal('');

  /** Suche über E-Mail-Adresse und den aus ihr abgeleiteten Anzeigenamen (kein echter Benutzername vorhanden). */
  readonly gefiltert = computed(() => {
    const suchtext = this.suche().trim().toLowerCase();
    if (!suchtext) return this.benutzer();
    return this.benutzer().filter(
      (eintrag) =>
        eintrag.email.toLowerCase().includes(suchtext) ||
        anzeigenameAusEmail(eintrag.email).toLowerCase().includes(suchtext),
    );
  });

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
