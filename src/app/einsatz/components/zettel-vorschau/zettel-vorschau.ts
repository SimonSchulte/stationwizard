import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Zettel } from '../../services/aufbau-zettel';

/**
 * Vorschau des abgeleiteten Zettels mit Farbband links, Zielblock, Lagertrennern und einer
 * Platzanzeige (Rasterzeilen von 23). Rein darstellend; der Druck nutzt dieselbe Ableitung.
 */
@Component({
  selector: 'app-zettel-vorschau',
  templateUrl: './zettel-vorschau.html',
  styleUrl: './zettel-vorschau.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZettelVorschau {
  readonly zettel = input.required<Zettel>();

  protected readonly anteil = computed(() => {
    const z = this.zettel();
    return Math.min(100, Math.round((z.belegt / z.kapazitaet) * 100));
  });
  protected readonly zuVoll = computed(() => this.zettel().belegt > this.zettel().kapazitaet);
  protected readonly farbwert = computed(() => `var(--${this.zettel().farbe})`);
}
