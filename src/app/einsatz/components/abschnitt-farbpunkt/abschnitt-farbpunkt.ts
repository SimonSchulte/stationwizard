import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ABSCHNITT_FARBE_BEZEICHNUNG, AbschnittFarbe } from '../../models/vb.model';

/** Farbpunkt eines VB-Abschnitts (Token `--abschnitt-n`), mit Farbname für Screenreader. */
@Component({
  selector: 'app-abschnitt-farbpunkt',
  templateUrl: './abschnitt-farbpunkt.html',
  styleUrl: './abschnitt-farbpunkt.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbschnittFarbpunkt {
  readonly farbe = input.required<AbschnittFarbe>();
  readonly farbwert = computed(() => `var(--${this.farbe()})`);
  readonly bezeichnung = computed(() => ABSCHNITT_FARBE_BEZEICHNUNG[this.farbe()]);
}
