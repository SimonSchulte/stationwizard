import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatiereDatum, wochentag } from '../../../kern/kalender/datum';
import { berechneAngebot } from '../../services/angebot-kalkulation';
import { Angebot } from '../../models/angebot.model';
import { formatEuro } from '../../services/waehrung';

/**
 * Kostenaufstellung pro Schicht und insgesamt – dieselbe strukturierte
 * Kalkulation (`berechneAngebot`), die auch der Word-Export
 * (`angebot-word-export.ts`) verwendet, damit Bildschirm und Export nie
 * auseinanderlaufen.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-angebot-kalkulationstabelle',
  templateUrl: './angebot-kalkulationstabelle.html',
  styleUrl: './angebot-kalkulationstabelle.less',
})
export class AngebotKalkulationstabelle {
  readonly angebot = input.required<Angebot>();

  readonly formatEuro = formatEuro;
  readonly formatiereDatum = formatiereDatum;
  readonly wochentag = wochentag;

  readonly kalkulation = computed(() => berechneAngebot(this.angebot()));
}
