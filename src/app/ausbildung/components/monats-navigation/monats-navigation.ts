import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MONATSNAMEN } from '../../../kern/kalender/datum';

/**
 * Monatsnavigation: Pfeile, Monatsmenü mit „Ganzes Jahr“ und „Zum aktuellen Monat“.
 * Monate sind 0-basiert; `null` steht für das ganze Jahr, dann ruhen die Pfeile.
 */
@Component({
  selector: 'app-monats-navigation',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './monats-navigation.html',
  styleUrl: './monats-navigation.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonatsNavigation {
  readonly monat = input.required<number | null>();
  /** Zeigt der Plan bereits den laufenden Monat? Dann ist „heute“ ohne Wirkung. */
  readonly imAktuellenMonat = input(false);

  readonly monatGewaehlt = output<number | null>();
  readonly zumAktuellenMonat = output<void>();

  protected readonly monatsnamen = MONATSNAMEN;
  protected readonly titel = computed(() => {
    const monat = this.monat();
    return monat === null ? 'Ganzes Jahr' : MONATSNAMEN[monat];
  });

  protected verschieben(schritt: number): void {
    const monat = this.monat();
    if (monat === null) return;
    this.monatGewaehlt.emit(Math.min(11, Math.max(0, monat + schritt)));
  }
}
