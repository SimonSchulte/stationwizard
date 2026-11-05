import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Leerzustand } from '../../../kern/zustand/zustand';
import { PepPosition, PepVorlageInhalt } from '../../models/pep.model';

/** Die Anforderungen einer Position als kurze Texte: Taktisch, Medizinisch, Zusatz. */
export function anforderungsTexte(position: PepPosition): string[] {
  const { taktisch, medizinisch, zusatz } = position.anforderungen;
  return [taktisch, medizinisch, zusatz?.trim() || null].filter(
    (text): text is string => text !== null && text !== '',
  );
}

/**
 * Lesende Ansicht einer PEP-Vorlage: je Posten Bezeichnung, Fahrzeug und Positionen mit ihren
 * Anforderungen. Rein darstellend.
 */
@Component({
  selector: 'app-pep-vorlage-ansicht',
  imports: [MatIconModule, Leerzustand],
  templateUrl: './pep-vorlage-ansicht.html',
  styleUrl: './pep-vorlage-ansicht.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PepVorlageAnsicht {
  readonly inhalt = input.required<PepVorlageInhalt>();

  readonly positionenGesamt = computed(() =>
    this.inhalt().posten.reduce((summe, posten) => summe + posten.positionen.length, 0),
  );

  protected readonly anforderungen = anforderungsTexte;
}
