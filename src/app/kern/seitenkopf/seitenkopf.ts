import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

/**
 * Einheitlicher Seitenkopf aller Fachseiten auf Basis von `mat-toolbar`: links optional der
 * Zurück-Pfeil, das Symbol des Bereichs und der Titel (bei Platzmangel gekürzt), rechts die
 * hineinprojizierten Aktionen. Auf schmalen Bildschirmen rücken die Aktionen in eine eigene
 * Zeile, statt den Titel zu verdrängen. Bleibt beim Scrollen oben stehen.
 *
 * Konvention für die Aktionen: höchstens eine Hauptaktion `matButton="filled"`, weitere
 * Aktionen `matButton="outlined"`, Nebenaktionen `matButton` oder ein Menü (`more_vert`).
 */
@Component({
  selector: 'app-seitenkopf',
  imports: [MatButtonModule, MatIconModule, MatToolbarModule, MatTooltipModule, RouterLink],
  templateUrl: './seitenkopf.html',
  styleUrl: './seitenkopf.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Seitenkopf {
  readonly titel = input.required<string>();
  readonly icon = input<string>();
  /** Ziel des Zurück-Pfeils; ohne Angabe kein Pfeil. */
  readonly zurueck = input<string>();
  /** Beschriftung des Zurück-Pfeils für Lesehilfe und Tooltip. */
  readonly zurueckText = input('Zurück');
}
