import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { Suchfeld } from '../../../kern/suchfeld/suchfeld';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { Kiste, Lager, STAMMDATEN_GRENZEN } from '../../models/stammdaten.model';
import { lagerSchluessel } from '../../services/lager';

/**
 * Liste der Kisten mit Suche und Zeile zum Anlegen. Rein darstellend: die Wahl einer Kiste und das
 * Anlegen gehen als Ausgabe an die Seite, die auch ungespeicherte Änderungen des Editors kennt.
 */
@Component({
  selector: 'app-kiste-liste',
  imports: [
    Leerzustand,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    Suchfeld,
  ],
  templateUrl: './kiste-liste.html',
  styleUrl: './kiste-liste.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KisteListe {
  readonly kisten = input.required<readonly Kiste[]>();
  readonly lager = input<readonly Lager[]>([]);
  readonly gewaehltId = input<string | null>(null);

  readonly gewaehlt = output<string>();
  readonly angelegt = output<string>();

  protected readonly maxName = STAMMDATEN_GRENZEN.name;
  protected readonly suche = signal('');

  protected readonly treffer = computed(() => {
    const begriff = lagerSchluessel(this.suche());
    return begriff === ''
      ? this.kisten()
      : this.kisten().filter((k) => lagerSchluessel(k.name).includes(begriff));
  });

  protected lagerName(kiste: Kiste): string {
    return this.lager().find((l) => l.id === kiste.lagerId)?.name ?? '';
  }

  protected anlegen(feld: HTMLInputElement): void {
    const name = feld.value.trim();
    if (name === '') return;
    this.angelegt.emit(name);
    feld.value = '';
  }
}
