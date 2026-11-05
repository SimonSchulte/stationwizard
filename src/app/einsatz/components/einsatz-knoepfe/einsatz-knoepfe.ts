import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VbKennzahlen } from '../../models/einsatz.model';

/**
 * Die zwei Knöpfe je Einsatz in der Übersicht: „PEP öffnen/anlegen“ und „VB öffnen/anlegen“.
 * Rein darstellend; `einsatz` ist `null`, solange zur Veranstaltung noch kein Einsatz besteht
 * (beide Knöpfe zeigen dann „anlegen“). Ein Klick löst keinen Zeilenklick aus.
 */
@Component({
  selector: 'app-einsatz-knoepfe',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './einsatz-knoepfe.html',
  styleUrl: './einsatz-knoepfe.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinsatzKnoepfe {
  /** Stand des Einsatzes; `null`, wenn es ihn noch nicht gibt. */
  readonly stand = input<{ pepId: string | null; vb: VbKennzahlen | null } | null>(null);
  /** Kurzer Name des Einsatzes für die Screenreader-Beschriftung. */
  readonly titel = input('');
  readonly gesperrt = input(false);
  readonly pepKlick = output<void>();
  readonly vbKlick = output<void>();

  protected readonly hatPep = computed(() => !!this.stand()?.pepId);
  protected readonly hatVb = computed(() => !!this.stand()?.vb);
  protected readonly vbTooltip = computed(() => {
    const vb = this.stand()?.vb;
    return vb ? `${vb.laufzettel} Laufzettel · ${vb.positionen} Positionen` : '';
  });
}
