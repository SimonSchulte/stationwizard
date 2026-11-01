import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CdkDragDrop, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SafeUrl } from '@angular/platform-browser';
import type { DragData, DropData } from '../../models/drag-drop.model';
import {
  Einsatzkraft,
  Medizinisch,
  Position,
  TAKTISCH_ORDER,
  Taktisch,
} from '../../models/planung.model';
import { MatchService } from '../../services/match.service';
import { AnforderungsAuswahl } from '../anforderungs-auswahl/anforderungs-auswahl';
import { QualifikationsChips } from '../qualifikations-chips/qualifikations-chips';

function istTaktisch(wert: Taktisch | Medizinisch): wert is Taktisch {
  return (TAKTISCH_ORDER as readonly string[]).includes(wert);
}

const SYMBOL = {
  full: 'check_circle',
  partial: 'warning',
  mismatch: 'cancel',
  neutral: 'radio_button_unchecked',
} as const;

/**
 * Eine Position eines Postens: Bezeichnung, Postenführer-Kennzeichen, Anforderungen und
 * Besetzung als Ablageziel. Rein darstellend – jede Änderung geht als Ereignis an den Editor,
 * der sie über den `PlanungStoreService` (mit Rückgängig) ausführt.
 */
@Component({
  selector: 'app-position-zeile',
  imports: [
    AnforderungsAuswahl,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    QualifikationsChips,
  ],
  templateUrl: './position-zeile.html',
  styleUrl: './position-zeile.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(contextmenu)': 'kontextmenue.emit($event)' },
})
export class PositionZeile {
  private readonly abgleich = inject(MatchService);

  readonly position = input.required<Position>();
  readonly postenId = input.required<string>();
  /** Vollständige Einsatzkraft der Besetzung, für Qualifikationen und Abgleich. */
  readonly besetzung = input<Einsatzkraft | null>(null);
  /** Gerade gezogene Einsatzkraft; färbt die Ablagefläche nach ihrer Eignung. */
  readonly gezogen = input<Einsatzkraft | null>(null);
  readonly postenfuehrerSymbol = input.required<SafeUrl>();

  readonly kontextmenue = output<MouseEvent>();
  readonly postenfuehrerUmschalten = output<void>();
  readonly bezeichnungGeaendert = output<string>();
  readonly taktischGeaendert = output<Taktisch | null>();
  readonly medizinischGeaendert = output<Medizinisch | null>();
  readonly abgelegt = output<CdkDragDrop<DropData, DragData>>();
  readonly ziehenGestartet = output<CdkDragStart<DragData>>();
  readonly ziehenBeendet = output<void>();
  readonly zuteilungAufheben = output<void>();

  protected readonly ablageDaten = computed<DropData>(() => ({
    postenId: this.postenId(),
    positionId: this.position().id,
  }));

  protected readonly ziehDaten = computed<DragData | null>(() => {
    const besetzt = this.position().assigned;
    return besetzt
      ? {
          einsatzkraftId: besetzt.id,
          fromPostenId: this.postenId(),
          fromPositionId: this.position().id,
        }
      : null;
  });

  /** Eignung der Besetzung – Grundlage des Statussymbols. */
  protected readonly eignung = computed(() =>
    this.abgleich.positionMatchClass(this.position(), this.besetzung()),
  );

  /** Während des Ziehens zählt die gezogene Einsatzkraft, sonst die Besetzung. */
  protected readonly ablageKlasse = computed(
    () =>
      'position-assigned match-' +
      this.abgleich.positionMatchClass(this.position(), this.gezogen() ?? this.besetzung()),
  );

  protected readonly symbol = computed(() => SYMBOL[this.eignung()]);

  protected taktischUebernehmen(wert: Taktisch | Medizinisch | null): void {
    if (wert === null || istTaktisch(wert)) this.taktischGeaendert.emit(wert);
  }

  protected medizinischUebernehmen(wert: Taktisch | Medizinisch | null): void {
    if (wert === null || !istTaktisch(wert)) this.medizinischGeaendert.emit(wert);
  }

  protected bezeichnungUebernehmen(ereignis: FocusEvent): void {
    this.bezeichnungGeaendert.emit((ereignis.target as HTMLInputElement).value);
  }
}
