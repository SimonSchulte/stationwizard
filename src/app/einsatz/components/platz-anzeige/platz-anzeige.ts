import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LaufzettelPlatz } from '../../services/laufzettel-platz';

/**
 * Balken und Zahl für die Belegung eines Laufzettelstreifens („6 von 23 Zeilen“). Rein
 * darstellend; die Zahlen kommen aus `laufzettelPlatz()`, derselben Funktion wie beim Druck.
 */
@Component({
  selector: 'app-platz-anzeige',
  templateUrl: './platz-anzeige.html',
  styleUrl: './platz-anzeige.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-zustand]': 'platz().zustand' },
})
export class PlatzAnzeige {
  readonly platz = input.required<LaufzettelPlatz>();

  protected readonly prozent = computed(() => {
    const { belegt, kapazitaet } = this.platz();
    return Math.min(100, Math.round((belegt / kapazitaet) * 100));
  });

  protected readonly beschreibung = computed(() => {
    const { belegt, kapazitaet, zustand } = this.platz();
    const zusatz =
      zustand === 'zu-voll' ? ', passt nicht' : zustand === 'knapp' ? ', wird knapp' : '';
    return `${belegt} von ${kapazitaet} Zeilen belegt${zusatz}`;
  });
}
