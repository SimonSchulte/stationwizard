import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Einsatzkraft, Medizinisch, Taktisch } from '../../models/planung.model';
import { MatchService, MEDIZINISCH_LABEL, TAKTISCH_LABEL } from '../../services/match.service';

/**
 * Qualifikationen einer Einsatzkraft als farbige Chips: taktisch, medizinisch und
 * Zusatzqualifikationen. Farben kommen aus dem `MatchService` (CI-Tokens), die
 * Chip-Grundform aus den globalen `.tag-chip`-Regeln in `styles.less`.
 */
@Component({
  selector: 'app-qualifikations-chips',
  imports: [MatTooltipModule],
  templateUrl: './qualifikations-chips.html',
  styleUrl: './qualifikations-chips.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QualifikationsChips {
  private readonly abgleich = inject(MatchService);

  readonly tags = input.required<Einsatzkraft['tags']>();
  /** Kleine Chips, etwa in einer besetzten Position. */
  readonly klein = input(false);
  /** Zeigt die ausgeschriebene Bezeichnung als Tooltip. */
  readonly beschreibung = input(true);
  /** Zusatzqualifikationen (freie Bezeichnungen) mit anzeigen. */
  readonly zusatz = input(true);

  protected readonly taktischLabel = TAKTISCH_LABEL;
  protected readonly medizinischLabel = MEDIZINISCH_LABEL;

  protected taktischFarbe(tag: Taktisch): { bg: string; fg: string } {
    return this.abgleich.taktischColor(tag);
  }

  protected medizinischFarbe(tag: Medizinisch): { bg: string; fg: string } {
    return this.abgleich.medizinischColor(tag);
  }
}
