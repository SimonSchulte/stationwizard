import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type MeldungArt = 'fehler' | 'warnung' | 'info' | 'erfolg';

const SYMBOL: Readonly<Record<MeldungArt, string>> = {
  fehler: 'error',
  warnung: 'warning',
  info: 'info',
  erfolg: 'check_circle',
};

/**
 * Einheitliche Inline-Meldung (Fehler, Warnung, Hinweis, Erfolg) mit Symbol, getönter Fläche
 * und farbigem Rand. Fehler und Warnungen werden als `alert`, alles andere als `status`
 * angesagt. Eine Aktion („Erneut versuchen“, „Ausblenden“) wird mit dem Attribut
 * `meldungAktion` hineinprojiziert und steht rechts.
 */
@Component({
  selector: 'app-meldung',
  imports: [MatIconModule],
  templateUrl: './meldung.html',
  styleUrl: './meldung.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'art-' + art()",
    '[attr.role]': "art() === 'fehler' || art() === 'warnung' ? 'alert' : 'status'",
  },
})
export class Meldung {
  readonly art = input<MeldungArt>('info');
  protected readonly symbol = computed(() => SYMBOL[this.art()]);
}
