import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { VORGANG_STUFEN } from '../../models/vorgang.model';

/** Die sechs Stufen des Vorgangs als Stepper; rein darstellend. */
@Component({
  selector: 'app-vorgang-stufen',
  imports: [MatIconModule],
  templateUrl: './vorgang-stufen.html',
  styleUrl: './vorgang-stufen.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VorgangStufen {
  /** Zuletzt erreichte Stufe; -1, solange noch keine erreicht ist. */
  readonly stufe = input.required<number>();
  protected readonly STUFEN = VORGANG_STUFEN;
}
