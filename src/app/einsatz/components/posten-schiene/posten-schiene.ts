import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { Posten } from '../../models/planung.model';
import { Leerzustand } from '../../../kern/zustand/leerzustand';

/**
 * Seitenschiene mit allen Posten des Einsatzes: Farbstreifen, Name, Fahrzeug, Stand der
 * Besetzung als Ring. Wählt den Posten, den der Editor groß zeigt. Rein darstellend.
 */
@Component({
  selector: 'app-posten-schiene',
  imports: [Leerzustand, MatButtonModule, MatIconModule],
  templateUrl: './posten-schiene.html',
  styleUrl: './posten-schiene.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostenSchiene {
  readonly posten = input.required<readonly Posten[]>();
  readonly aktivId = input<string | null>(null);

  readonly gewaehlt = output<string>();
  readonly neuerPosten = output<void>();

  /** Abschnittsfarben des Aufbaus, reihum: gleiche Palette, gleiche Wiedererkennung. */
  protected farbe(index: number): string {
    return `var(--abschnitt-${(index % 8) + 1})`;
  }

  protected besetzt(posten: Posten): number {
    return posten.positions.filter((position) => position.assigned !== null).length;
  }

  protected anteil(posten: Posten): number {
    return posten.positions.length === 0
      ? 0
      : Math.round((this.besetzt(posten) / posten.positions.length) * 100);
  }

  protected vollstaendig(posten: Posten): boolean {
    return posten.positions.length > 0 && this.besetzt(posten) === posten.positions.length;
  }

  protected untertitel(posten: Posten): string {
    const offen = posten.positions.length - this.besetzt(posten);
    const stand = this.vollstaendig(posten)
      ? 'vollständig'
      : posten.positions.length === 0
        ? 'keine Positionen'
        : `${offen} offen`;
    return posten.fahrzeug?.funkruf ? `${posten.fahrzeug.funkruf} · ${stand}` : stand;
  }
}
