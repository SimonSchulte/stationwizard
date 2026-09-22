import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { KilometerAmpel, KilometerJahresbilanz } from '../../services/kilometer-soll';

/**
 * Visualisiert eine `KilometerJahresbilanz` als Fortschrittsbalken (gefahrene
 * Kilometer gegen das Jahressoll) mit Restwert – gemeinsam genutzt vom
 * Fuhrpark-Dashboard (je Fahrzeug in der Liste) und der Fahrzeugdetailseite,
 * damit beide Stellen dieselbe Darstellung zeigen.
 *
 * Die Ampel (`ermittleKilometerAmpel` in `kilometer-soll.ts`) berechnet nicht
 * diese Komponente selbst: sie braucht dafür die verbleibenden Monate des
 * Bilanzjahres und die konfigurierbaren Schwellenwerte aus der
 * Systemkonfiguration, beides Kontext, den der Aufrufer schon kennt. Ohne
 * `ampel`-Eingabe bleibt die Karte wie bisher ohne Ampelpunkt.
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
  readonly ampel = input<KilometerAmpel | null>(null);

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
