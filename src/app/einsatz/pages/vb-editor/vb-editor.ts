import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Leerzustand } from '../../../kern/zustand/leerzustand';

/** Platzhalter, wird durch die eigentliche Seite ersetzt. */
@Component({
  selector: 'app-vb-editor',
  imports: [Seitenkopf, Leerzustand],
  templateUrl: './vb-editor.html',
  styleUrl: './vb-editor.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VbEditor {}
