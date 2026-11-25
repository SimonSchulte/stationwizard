import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import {
  VERSANDWEGE,
  VERSANDWEG_HINWEIS,
  VERSANDWEG_LABEL,
  Versandweg,
} from '../../models/systemkonfiguration.model';

/**
 * Auswahl des Versandwegs einer Mailart. Rein darstellend: welche Wege am Worker eingerichtet
 * sind, kommt von außen; ein nicht eingerichteter Weg bleibt wählbar (die Einstellung lässt sich
 * vorab speichern), wird aber gekennzeichnet.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-versandweg-auswahl',
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './versandweg-auswahl.html',
  styleUrl: './versandweg-auswahl.less',
})
export class VersandwegAuswahl {
  readonly wert = model.required<Versandweg>();
  readonly gesperrt = input(false);
  /** Wege, die am Worker eingerichtet sind. */
  readonly eingerichtet = input.required<readonly Versandweg[]>();

  protected readonly versandwege = VERSANDWEGE;
  protected readonly label = VERSANDWEG_LABEL;
  protected readonly hinweis = VERSANDWEG_HINWEIS;
}
