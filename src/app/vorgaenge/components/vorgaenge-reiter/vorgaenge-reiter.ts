import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AmpelChip } from '../../../fahrzeuge/components/ampel-chip/ampel-chip';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { LETZTE_STUFE, VORGANG_STUFEN } from '../../models/vorgang.model';
import { FahrzeugKurz, VorgangAnlegenService } from '../../services/vorgang-anlegen.service';
import { PostfachStoreService } from '../../services/postfach-store.service';
import { VorgangStoreService } from '../../services/vorgang-store.service';

/** Reiter „Vorgänge“ der Fahrzeugakte: die Vorgänge dieses Fahrzeugs, offene zuerst. */
@Component({
  selector: 'app-vorgaenge-reiter',
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
  templateUrl: './vorgaenge-reiter.html',
  styleUrl: './vorgaenge-reiter.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VorgaengeReiter implements OnInit {
  private readonly store = inject(VorgangStoreService);
  private readonly anlegen = inject(VorgangAnlegenService);
  private readonly postfach = inject(PostfachStoreService);

  readonly fahrzeug = input.required<FahrzeugKurz>();

  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;
  readonly vorgaenge = computed(() =>
    this.store
      .liste()
      .filter((v) => v.fahrzeugId === this.fahrzeug().id)
      .sort(
        (a, b) =>
          Number(a.stufe >= LETZTE_STUFE) - Number(b.stufe >= LETZTE_STUFE) ||
          b.geaendertAm.localeCompare(a.geaendertAm),
      ),
  );

  /** Die Postfachadresse dieses Fahrzeugs, an die Angebote weitergeleitet werden können. */
  readonly adresse = computed(
    () =>
      this.postfach.adressen()?.adressen.find((a) => a.fahrzeugId === this.fahrzeug().id)
        ?.adresse ?? '',
  );

  ngOnInit(): void {
    void this.postfach.adressenLaden();
    void this.store.listeLaden();
  }

  stufeText(stufe: number): string {
    return stufe < 0 ? 'Schadensmeldung wird erfasst' : VORGANG_STUFEN[stufe];
  }

  async neu(): Promise<void> {
    await this.anlegen.neuFuerFahrzeug(this.fahrzeug());
  }
}
