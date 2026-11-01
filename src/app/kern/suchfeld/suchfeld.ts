import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

/**
 * Einheitliches Suchfeld: Material-Formularfeld mit Rahmen, Lupe vorn und Löschknopf, sobald
 * etwas eingegeben ist. Zweiwegbindung über `[(wert)]` an ein Signal der Seite.
 */
@Component({
  selector: 'app-suchfeld',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './suchfeld.html',
  styleUrl: './suchfeld.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Suchfeld {
  readonly wert = model('');
  readonly beschriftung = input('Suchen');
  readonly platzhalter = input('');

  protected uebernehmen(ereignis: Event): void {
    this.wert.set((ereignis.target as HTMLInputElement).value);
  }
}
