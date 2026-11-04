import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  FACHGRUPPE_BEZEICHNUNG,
  FACHGRUPPE_FARBVARIABLE,
  Fachgruppe,
} from '../../../kern/fachgruppen/fachgruppe';

/**
 * Beschrifteter Chip einer Fachgruppe in ihrer Kategorienfarbe – auf Laufzettelkarten, in
 * Listen und Dialogen der Vorbereitung. Die Beschriftung trägt die Information, die Farbe
 * stützt sie nur (Betreuung und Verpflegung teilen sich eine Farbe).
 */
@Component({
  selector: 'app-fachgruppe-chip',
  templateUrl: './fachgruppe-chip.html',
  styleUrl: './fachgruppe-chip.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FachgruppeChip {
  readonly fachgruppe = input.required<Fachgruppe>();
  readonly bezeichnung = computed(() => FACHGRUPPE_BEZEICHNUNG[this.fachgruppe()]);
  readonly farbe = computed(() => `var(${FACHGRUPPE_FARBVARIABLE[this.fachgruppe()]})`);
}
