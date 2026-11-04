import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Leerzustand } from '../../../kern/zustand/leerzustand';

/** Platzhalter, wird durch die eigentliche Seite ersetzt. */
@Component({
  selector: 'app-vb-vorlagen',
  imports: [Seitenkopf, Leerzustand],
  templateUrl: './vb-vorlagen.html',
  styleUrl: './vb-vorlagen.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VbVorlagen {}
