import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { staerkeStatus, type Staerke } from '../../services/staerke';

/**
 * Stärkemeldung als zweizeiliges Raster (Soll / Ist, je Führer / Unterführer / Helfer /
 * Gesamt). Die Ist-Zahlen färben sich nach ihrem Verhältnis zum Soll.
 */
@Component({
  selector: 'app-staerke-block',
  templateUrl: './staerke-block.html',
  styleUrl: './staerke-block.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'grid',
    '[attr.aria-label]': 'beschriftung()',
    '[class.kompakt]': 'kompakt()',
  },
})
export class StaerkeBlock {
  readonly soll = input.required<Staerke>();
  readonly ist = input.required<Staerke>();
  readonly beschriftung = input('Stärke');
  /** Kleinere Schrift für den Kopf eines Postens. */
  readonly kompakt = input(false);

  protected readonly teile = ['fuhrer', 'unterfuehrer', 'helfer'] as const;
  protected readonly status = staerkeStatus;
}
