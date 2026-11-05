import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

/**
 * Datumsblock für Listen: Monat klein, Tag groß, darunter eine kurze Zeile (Wochentag, Beginn).
 * Gleiche Anmutung wie in der Einsatzkarte (`--einsatz-datum-breite`). Rein darstellend; was
 * in den Zeilen steht, bestimmt die Seite.
 */
@Component({
  selector: 'app-datumsblock',
  templateUrl: './datumsblock.html',
  styleUrl: './datumsblock.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.heute]': 'heute()',
    '[class.luecke]': 'luecke()',
    '[class.wochenende]': 'wochenende()',
    '[attr.aria-label]': 'beschriftung()',
  },
})
export class Datumsblock {
  /** Monat kurz in Großbuchstaben, etwa „MÄR“; leer für einen Block ohne Datum. */
  readonly monat = input('');
  /** Tag im Monat ohne führende Null. */
  readonly tag = input.required<string>();
  /** Untere Zeile, etwa „Di · 19:00“ oder „Sa–So“. */
  readonly zeile = input('');
  /** Der heutige Tag: gefüllte Fläche. */
  readonly heute = input(false, { transform: booleanAttribute });
  /** Diensttag ohne Ausbildung: gestrichelter Rand statt Fläche. */
  readonly luecke = input(false, { transform: booleanAttribute });
  /** Samstag/Sonntag: Wochentag in Rot. */
  readonly wochenende = input(false, { transform: booleanAttribute });
  /** Vollständige Beschriftung für Screenreader, etwa „Dienstag, 3. März“. */
  readonly beschriftung = input<string | null>(null);
}
