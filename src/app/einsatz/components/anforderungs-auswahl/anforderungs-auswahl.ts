import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  MEDIZINISCH_ORDER,
  Medizinisch,
  TAKTISCH_ORDER,
  Taktisch,
} from '../../models/planung.model';
import { MatchService } from '../../services/match.service';

type Qualifikation = Taktisch | Medizinisch;

/**
 * Chip mit Auswahlmenü für die Anforderung einer Position, taktisch oder medizinisch.
 * Die Rangfolgen kommen unverändert aus `TAKTISCH_ORDER`/`MEDIZINISCH_ORDER`.
 */
@Component({
  selector: 'app-anforderungs-auswahl',
  imports: [MatIconModule, MatMenuModule],
  templateUrl: './anforderungs-auswahl.html',
  styleUrl: './anforderungs-auswahl.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnforderungsAuswahl {
  private readonly abgleich = inject(MatchService);

  readonly art = input.required<'taktisch' | 'medizinisch'>();
  readonly wert = input.required<Qualifikation | null>();
  readonly gewaehlt = output<Qualifikation | null>();

  protected readonly optionen = computed<readonly Qualifikation[]>(() =>
    this.art() === 'taktisch' ? TAKTISCH_ORDER : MEDIZINISCH_ORDER,
  );

  protected farbe(wert: Qualifikation): { bg: string; fg: string } {
    return this.art() === 'taktisch'
      ? this.abgleich.taktischColor(wert as Taktisch)
      : this.abgleich.medizinischColor(wert as Medizinisch);
  }
}
