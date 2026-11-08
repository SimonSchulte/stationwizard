import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import type { OffeneAnforderung } from '../../services/vorschlaege';
import type { Staerke } from '../../services/staerke';
import { Datumsblock } from '../../../kern/datumsblock/datumsblock';
import { StaerkeBlock } from '../staerke-block/staerke-block';

/**
 * Band unter der Werkzeugleiste: Gesamtstärke, Fortschritt und die offenen Anforderungen.
 * Eine Lücke (niemand Verfügbares passt) ist rot, eine offene Anforderung mit Kandidaten
 * orange. Rein darstellend.
 */
@Component({
  selector: 'app-besetzungs-band',
  imports: [Datumsblock, MatChipsModule, MatIconModule, StaerkeBlock],
  templateUrl: './besetzungs-band.html',
  styleUrl: './besetzungs-band.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BesetzungsBand {
  /** Beginn des Einsatzes als Datumsblock; ohne Angabe bleibt er weg. */
  readonly datum = input<{
    monat: string;
    tag: string;
    zeile: string;
    beschriftung: string;
  } | null>(null);
  readonly soll = input.required<Staerke>();
  readonly ist = input.required<Staerke>();
  readonly offen = input<readonly OffeneAnforderung[]>([]);

  protected anteil(): number {
    const soll = this.soll().gesamt;
    return soll === 0 ? 0 : Math.min(100, Math.round((this.ist().gesamt / soll) * 100));
  }
}
