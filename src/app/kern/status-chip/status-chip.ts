import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/** Symbol, Kurztext und Erklärung eines Verbindungs- oder Datenstands. */
export interface StatusAnzeige {
  icon: string;
  text: string;
  tooltip: string;
}

/**
 * Klickbarer Status-Chip der Kopfleiste (etwa „Datenbank verbunden“, „HiOrg verbunden“):
 * grün, solange verbunden; ein Klick lädt in der Regel neu. Zusätzliche Kennzeichen wie der
 * Punkt für ungespeicherte Änderungen werden hineinprojiziert. Auf schmalen Bildschirmen
 * bleibt nur das Symbol.
 */
@Component({
  selector: 'app-status-chip',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChip {
  readonly anzeige = input.required<StatusAnzeige>();
  readonly verbunden = input(false);
  readonly gesperrt = input(false);
  readonly gewaehlt = output<void>();
}
