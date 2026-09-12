import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { EIGENTUEMER_LABEL } from '../../services/eigentuemer-label';
import { Eigentuemer } from '../../models/fahrzeug.model';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-liste',
  imports: [
    KeyValuePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './fahrzeug-liste.html',
  styleUrl: './fahrzeug-liste.less',
})
export class FahrzeugListe implements OnInit {
  private readonly store = inject(FahrzeugStoreService);
  private readonly router = inject(Router);

  readonly EIGENTUEMER_LABEL = EIGENTUEMER_LABEL;
  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;

  readonly suche = signal('');
  readonly eigentuemerFilter = signal<Eigentuemer | 'alle'>('alle');

  readonly gefiltert = computed(() => {
    const suchtext = this.suche().trim().toLowerCase();
    const filter = this.eigentuemerFilter();
    return this.store
      .fahrzeuge()
      .filter((f) => filter === 'alle' || f.eigentuemer === filter)
      .filter(
        (f) =>
          !suchtext ||
          f.bezeichnung.toLowerCase().includes(suchtext) ||
          f.funkrufname.toLowerCase().includes(suchtext) ||
          f.kennzeichen.toLowerCase().includes(suchtext),
      );
  });

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  neuesFahrzeug(): void {
    this.store.neuesFahrzeugBeginnen();
    void this.router.navigate(['/fahrzeuge/neu']);
  }
}
