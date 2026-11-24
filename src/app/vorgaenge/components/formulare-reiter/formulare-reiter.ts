import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AmpelChip } from '../../../fahrzeuge/components/ampel-chip/ampel-chip';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { FahrzeugKurz, VorgangAnlegenService } from '../../services/vorgang-anlegen.service';
import { VorgangStoreService } from '../../services/vorgang-store.service';

/** Reiter „Formulare“ der Fahrzeugakte: bisher genau ein Formular, die Schadens- und Verlustmeldung. */
@Component({
  selector: 'app-formulare-reiter',
  imports: [
    AmpelChip,
    DatePipe,
    Ladeanzeige,
    Leerzustand,
    Meldung,
    MatButtonModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: './formulare-reiter.html',
  styleUrl: './formulare-reiter.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormulareReiter implements OnInit {
  private readonly store = inject(VorgangStoreService);
  private readonly anlegen = inject(VorgangAnlegenService);

  readonly fahrzeug = input.required<FahrzeugKurz>();

  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;
  readonly meldungen = computed(() =>
    this.store
      .liste()
      .filter((v) => v.fahrzeugId === this.fahrzeug().id)
      .sort((a, b) => b.geaendertAm.localeCompare(a.geaendertAm)),
  );

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  async neu(): Promise<void> {
    await this.anlegen.neuFuerFahrzeug(this.fahrzeug());
  }
}
