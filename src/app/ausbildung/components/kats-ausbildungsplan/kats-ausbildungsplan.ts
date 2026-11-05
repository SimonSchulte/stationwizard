import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Datumsblock } from '../../../kern/datumsblock/datumsblock';
import { formatiereDatum, wochentag } from '../../../kern/kalender/datum';
import { abstandZuHeute, blockZeile, monatKurz } from '../../services/datum-anzeige';
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
  imports: [Datumsblock, Leerzustand, MatIconModule, TerminKarte],
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

  /** Alles, was der Datumsblock und die Karte eines Eintrags brauchen. */
  protected block(termin: Termin) {
    const datum = termin.datum ?? '';
    return {
      monat: monatKurz(datum),
      tag: String(Number(datum.slice(8, 10))),
      zeile: blockZeile(datum, [termin]),
      modus: termin.beginnZeit ? ('tag-beginn' as const) : ('tag' as const),
      heute: datum === this.heute(),
      wochenende: wochentag(datum) === 'Sa' || wochentag(datum) === 'So',
      abstand: abstandZuHeute(datum, this.heute()),
      beschriftung: `${wochentag(datum)} ${formatiereDatum(datum)}`,
    };
  }
}
