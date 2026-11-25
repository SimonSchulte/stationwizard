import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UnterschriftAnzeige } from '../../../kern/unterschrift/unterschrift-anzeige';
import { AmpelChip } from '../../../fahrzeuge/components/ampel-chip/ampel-chip';
import { Namensverzeichnis } from '../../../kern/namensverzeichnis';
import { PFLICHT_SLOTS, SLOT_BEZEICHNUNG, UnterschriftStand } from '../../models/vorgang.model';

/**
 * Ein Unterschriftsfeld der Meldung in seinen drei Zuständen: offen, bei einer Person angefragt,
 * unterschrieben. Die Aktionen meldet die Zeile nur; ausgeführt werden sie von der Seite.
 */
@Component({
  selector: 'app-unterschrift-zeile',
  imports: [AmpelChip, DatePipe, MatButtonModule, MatIconModule, UnterschriftAnzeige],
  templateUrl: './unterschrift-zeile.html',
  styleUrl: './unterschrift-zeile.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnterschriftZeile {
  readonly stand = input.required<UnterschriftStand>();
  /** E-Mail der angemeldeten Person; erkennt eine Anfrage an sie. */
  readonly eigeneEmail = input('');
  /** Erst mit vollständigen Pflichtangaben lässt sich unterschreiben oder anfordern. */
  readonly bereit = input(false);
  readonly arbeitet = input(false);
  /** Nach dem Einreichen lässt sich nichts mehr ändern. */
  readonly eingereicht = input(false);

  private readonly namen = inject(Namensverzeichnis);

  readonly unterschreiben = output<void>();
  readonly anfordern = output<void>();
  readonly entfernen = output<void>();

  protected readonly bezeichnung = computed(() => SLOT_BEZEICHNUNG[this.stand().slot]);
  protected readonly pflicht = computed(() => PFLICHT_SLOTS.includes(this.stand().slot));
  protected readonly anMich = computed(
    () => this.stand().status === 'angefragt' && this.stand().anEmail === this.eigeneEmail(),
  );
  protected readonly anName = computed(() => this.namen.anzeige(this.stand().anEmail));
}
