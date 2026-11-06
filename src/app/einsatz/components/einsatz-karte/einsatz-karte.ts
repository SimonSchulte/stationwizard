import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { VbKennzahlen } from '../../models/einsatz.model';
import { PepKennzahlen } from '../../models/pep.model';
import { Datumsblock } from '../../../kern/datumsblock/datumsblock';
import { abstandText, datumsblock } from '../../services/einsatz-anzeige';

/**
 * Eine Karte der Einsatzübersicht: Datumsblock, Titel mit Metazeile und zwei Kacheln
 * „PEP“/„VB“ (öffnen oder anlegen). Rein darstellend; die Kacheln sind echte Material-Knöpfe
 * (`matButton="outlined"`), gestaltet über `--mat-button-outlined-*`-Tokens.
 */
@Component({
  selector: 'app-einsatz-karte',
  imports: [Datumsblock, MatButtonModule, MatIconModule],
  templateUrl: './einsatz-karte.html',
  styleUrl: './einsatz-karte.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EinsatzKarte {
  readonly titel = input.required<string>();
  /** Beginn lokal `YYYY-MM-DDTHH:mm` (oder EFS-Text); `null` ohne Datum. */
  readonly beginn = input<string | null>(null);
  readonly schichten = input<number | null>(null);
  readonly ort = input<string | null>(null);
  readonly herkunft = input<'hiorg' | 'eigen'>('eigen');
  readonly pepVorhanden = input(false);
  /** Kennzahlen der PEP; zeigt „n / m besetzt“. Gesetzt heißt: die PEP ist vorhanden. */
  readonly pepKennzahlen = input<PepKennzahlen | null>(null);
  readonly vbKennzahlen = input<VbKennzahlen | null>(null);
  /** Tage bis zum Beginn (heute = 0); `null` ohne Hinweis (vergangen oder ohne Datum). */
  readonly abstandTage = input<number | null>(null);
  /** Hebt den Abstandshinweis gelb hervor (bald und PEP oder VB fehlt). */
  readonly dringend = input(false);
  readonly gesperrt = input(false);
  readonly pep = output<void>();
  readonly vb = output<void>();

  protected readonly pepDa = computed(() => this.pepVorhanden() || this.pepKennzahlen() !== null);
  protected readonly abstand = computed(() => abstandText(this.abstandTage()));
  protected readonly datum = computed(() => datumsblock(this.beginn(), new Date().getFullYear()));
}
