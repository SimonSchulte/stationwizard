import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { KilometerJahresbilanz } from '../../services/kilometer-soll';

/**
 * Visualisiert eine `KilometerJahresbilanz` als Fortschrittsbalken (gefahrene
 * Kilometer gegen das Jahressoll) mit Restwert – gemeinsam genutzt vom
 * Fuhrpark-Dashboard (je Fahrzeug in der Liste) und der Fahrzeugdetailseite,
 * damit beide Stellen dieselbe Darstellung zeigen.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kilometer-bilanz',
  imports: [MatProgressBarModule],
  templateUrl: './kilometer-bilanz.html',
  styleUrl: './kilometer-bilanz.less',
})
export class KilometerBilanz {
  readonly bilanz = input.required<KilometerJahresbilanz>();

  readonly fortschrittProzent = computed(() => {
    const { sollKm, istKm } = this.bilanz();
    if (sollKm === 0 || istKm === null) return 0;
    return Math.max(0, Math.min(100, Math.round((istKm / sollKm) * 100)));
  });

  readonly zielErreicht = computed(() => {
    const { restKm } = this.bilanz();
    return restKm !== null && restKm <= 0;
  });
}
