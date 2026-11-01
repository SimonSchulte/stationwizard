import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Einheitlicher Leerzustand: Symbol, kurze Aussage und optional eine Erklärung sowie eine
 * hineinprojizierte Aktion (`leerAktion`). `kompakt` für Seitenleisten und Listenbereiche.
 */
@Component({
  selector: 'app-leerzustand',
  imports: [MatIconModule],
  templateUrl: './leerzustand.html',
  styleUrl: './leerzustand.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.kompakt]': 'kompakt()' },
})
export class Leerzustand {
  readonly icon = input('inbox');
  readonly titel = input.required<string>();
  readonly kompakt = input(false, { transform: booleanAttribute });
}
