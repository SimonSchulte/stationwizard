import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  UNTERSCHRIFT_BREITE,
  UNTERSCHRIFT_HOEHE,
  UnterschriftDaten,
  UnterschriftPunkt,
} from './unterschrift.model';

/** Eine Unterschrift als Schrift oder als gezeichneter Zug, ohne eigene Logik. */
@Component({
  selector: 'app-unterschrift-anzeige',
  templateUrl: './unterschrift-anzeige.html',
  styleUrl: './unterschrift-anzeige.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnterschriftAnzeige {
  readonly unterschrift = input.required<UnterschriftDaten>();
  /** Höhe in Pixeln; die Breite folgt dem Seitenverhältnis der Zeichenfläche. */
  readonly hoehe = input(40);

  protected readonly viewBox = `0 0 ${UNTERSCHRIFT_BREITE} ${UNTERSCHRIFT_HOEHE}`;

  protected readonly schrift = computed(() => {
    const daten = this.unterschrift();
    return daten.art === 'schrift' ? daten : null;
  });

  protected readonly punkte = computed(() => {
    const daten = this.unterschrift();
    return daten.art === 'zeichnung' ? daten.striche.map(streckenzug) : [];
  });
}

function streckenzug(strich: UnterschriftPunkt[]): string {
  return strich.map(([x, y]) => `${x},${y}`).join(' ');
}
