import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { formatiereDatum } from '../../../kern/kalender/datum';
import { Termin } from '../../models/plan.model';
import { baueKatsAusbildungsplan } from '../../services/kats-ausbildungsplan';
import { PlanStore } from '../../services/plan-store';
import { TerminKarte } from '../termin-karte/termin-karte';
import { Leerzustand } from '../../../kern/zustand/leerzustand';

const MONATSNAMEN = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleDateString('de-DE', { month: 'long' }),
);

/**
 * Ansicht „KatS-Ausbildungsplan“: alle KatS-Ausbildungen des gewählten Jahres als Liste nach
 * Monaten, dazu die Themen des KatS-A-Plans, auf die noch kein Termin verweist. Rein
 * darstellend; jede Änderung läuft über die Ausgaben in den Jahresplan.
 */
@Component({
  selector: 'app-kats-ausbildungsplan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Leerzustand, MatIconModule, TerminKarte],
  templateUrl: './kats-ausbildungsplan.html',
  styleUrl: './kats-ausbildungsplan.less',
})
export class KatsAusbildungsplan {
  private readonly store = inject(PlanStore);

  readonly heute = input.required<string>();
  readonly jahr = input.required<number>();

  readonly bearbeiten = output<string>();
  readonly zuBacklog = output<Termin>();
  readonly datumWaehlen = output<Termin>();
  readonly loeschen = output<string>();

  readonly plan = computed(() =>
    baueKatsAusbildungsplan(this.store.termine(), this.store.katsThemen()),
  );
  readonly monate = computed(() =>
    this.plan().monate.map((monat) => ({ ...monat, name: MONATSNAMEN[monat.index]! })),
  );

  tag(datum: string | null): string {
    return datum ? datum.slice(8, 10) : '';
  }

  wochentagKurz(datum: string | null): string {
    return datum
      ? new Date(`${datum}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' })
      : '';
  }

  datumText(datum: string | null): string {
    return datum ? formatiereDatum(datum) : '';
  }
}
