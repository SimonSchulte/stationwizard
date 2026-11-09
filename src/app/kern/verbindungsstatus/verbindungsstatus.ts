import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Anzeige einer Verbindung in der Kopfleiste (HiOrg-Server, HiOrg-Server-API …) in der Gestalt des
 * `app-status-chip` (`status-pille.less`), aber ohne Klickaktion. Geprüft wird im jeweiligen Dienst.
 */
@Component({
  selector: 'app-verbindungsstatus',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './verbindungsstatus.html',
  styleUrl: './verbindungsstatus.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.verbunden]': 'verbunden()' },
})
export class Verbindungsstatus {
  readonly verbunden = input.required<boolean>();
  readonly text = input.required<string>();
  readonly tooltip = input('');
}
