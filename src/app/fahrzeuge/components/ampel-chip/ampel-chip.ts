import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Dreifarbdarstellung der Kilometer- und Wartungsampeln plus „neutral“ für fehlende Angaben. */
export type AmpelFarbe = 'rot' | 'gelb' | 'gruen' | 'neutral';

const ICON: Record<AmpelFarbe, string> = {
  rot: 'error',
  gelb: 'warning',
  gruen: 'check_circle',
  neutral: 'schedule',
};

/**
 * Kleiner Status-Chip mit Symbol und Text. Der Zustand steht nie nur in der Farbe: das Symbol
 * trennt ihn auch ohne Farbwahrnehmung, der Text nennt ihn. Rein darstellend.
 */
@Component({
  selector: 'app-ampel-chip',
  imports: [MatIconModule],
  templateUrl: './ampel-chip.html',
  styleUrl: './ampel-chip.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AmpelChip {
  readonly farbe = input.required<AmpelFarbe>();
  readonly text = input.required<string>();

  protected readonly icon = computed(() => ICON[this.farbe()]);
}
