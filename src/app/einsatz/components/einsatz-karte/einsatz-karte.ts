import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { HiorgArt } from '../../models/hiorg-veranstaltung.model';
import { VbKennzahlen } from '../../models/einsatz.model';
import { PepKennzahlen } from '../../models/pep.model';
import { Datumsblock } from '../../../kern/datumsblock/datumsblock';
import { abstandText, datumsblock } from '../../services/einsatz-anzeige';
import type { EfsAbgleichArt } from '../../services/efs-abgleich';

/**
 * Eine Karte der Einsatzübersicht: Datumsblock, Titel mit Metazeile und drei Kacheln
 * „PEP“/„VB“/„Aufbau“ (öffnen oder anlegen). Rein darstellend; die Kacheln sind echte Material-Knöpfe
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
  /** Beginn lokal `YYYY-MM-DDTHH:mm` ; `null` ohne Datum. */
  readonly beginn = input<string | null>(null);
  readonly schichten = input<number | null>(null);
  readonly ort = input<string | null>(null);
  readonly herkunft = input<'hiorg' | 'eigen'>('eigen');
  /** Dienst oder Veranstaltung; `null` ohne Angabe. */
  readonly art = input<HiorgArt | null>(null);
  readonly pepVorhanden = input(false);
  /** Kennzahlen der PEP; zeigt „n / m besetzt“. Gesetzt heißt: die PEP ist vorhanden. */
  readonly pepKennzahlen = input<PepKennzahlen | null>(null);
  readonly vbKennzahlen = input<VbKennzahlen | null>(null);
  /** Tage bis zum Beginn (heute = 0); `null` ohne Hinweis (vergangen oder ohne Datum). */
  readonly abstandTage = input<number | null>(null);
  /** Hebt den Abstandshinweis gelb hervor (bald und PEP oder VB fehlt). */
  readonly dringend = input(false);
  readonly gesperrt = input(false);
  /** Ergebnis des EFS-Abgleichs; `null`, solange EFS nicht erreichbar ist (dann keine Anzeige). */
  readonly efsArt = input<EfsAbgleichArt | null>(null);
  readonly efsPruefen = output<void>();
  readonly pep = output<void>();
  readonly vb = output<void>();
  readonly aufbau = output<void>();

  protected readonly pepDa = computed(() => this.pepVorhanden() || this.pepKennzahlen() !== null);
  protected readonly abstand = computed(() => abstandText(this.abstandTage()));
  protected readonly datum = computed(() => datumsblock(this.beginn(), new Date().getFullYear()));
}
