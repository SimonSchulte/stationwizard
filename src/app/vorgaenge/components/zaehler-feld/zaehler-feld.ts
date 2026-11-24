import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/** Textfeld mit Längengrenze und Zähler; einzeilig oder mehrzeilig (`zeilen`). Rein darstellend. */
@Component({
  selector: 'app-zaehler-feld',
  imports: [MatFormFieldModule, MatInputModule],
  templateUrl: './zaehler-feld.html',
  styleUrl: './zaehler-feld.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZaehlerFeld {
  readonly beschriftung = input.required<string>();
  readonly wert = model.required<string>();
  readonly max = input.required<number>();
  /** Zeilenzahl eines mehrzeiligen Feldes; ohne Angabe ein einzeiliges Feld. */
  readonly zeilen = input<number>();
  readonly hinweis = input('');
  readonly pflicht = input(false, { transform: booleanAttribute });
  readonly gesperrt = input(false, { transform: booleanAttribute });

  protected readonly laenge = computed(() => this.wert().length);

  protected aendern(ereignis: Event): void {
    this.wert.set((ereignis.target as HTMLInputElement | HTMLTextAreaElement).value);
  }
}
