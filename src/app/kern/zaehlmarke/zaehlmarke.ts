import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Obergrenze der Anzeige: darüber steht „99+“, damit die Marke klein bleibt. */
export const ZAEHLMARKE_GRENZE = 99;

/**
 * Kleine Zahl an einem Symbol oder Menüpunkt (offene Aufgaben, Postfach). Bei 0 wird nichts
 * gerendert. Rein optisch (`aria-hidden`): die Beschriftung des umgebenden Elements nennt die
 * Zahl für Screenreader selbst.
 */
@Component({
  selector: 'app-zaehlmarke',
  template: `@if (anzahl() > 0) {
    <span class="marke" aria-hidden="true">{{ text() }}</span>
  }`,
  styleUrl: './zaehlmarke.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Zaehlmarke {
  readonly anzahl = input.required<number>();
  protected readonly text = computed(() =>
    this.anzahl() > ZAEHLMARKE_GRENZE ? `${ZAEHLMARKE_GRENZE}+` : String(this.anzahl()),
  );
}
