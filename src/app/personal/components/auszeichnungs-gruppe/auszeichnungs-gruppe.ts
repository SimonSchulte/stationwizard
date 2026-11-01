import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  EHRUNG_BEZEICHNUNG,
  EHRUNG_KURZ,
  VERGABEJAHR_MAXIMUM,
  VERGABEJAHR_MINIMUM,
  gruppeVon,
  hatErhalten,
  stufeGesperrt,
  type Anspruch,
  type EhrungSchluessel,
  type Erhalten,
} from '../../services/ehrungen-regeln';

/** Klasse für die Chipfarbe je Auszeichnung (`--abzeichen-*`-Tokens). */
export function chipKlasse(schluessel: EhrungSchluessel): string {
  const gruppe = gruppeVon(schluessel);
  return `chip-${gruppe === 'leistung' ? schluessel : gruppe}`;
}

/**
 * Eine Auszeichnungsgruppe einer Person: Chips zum Anhaken (in Staffelreihenfolge gesperrt),
 * das Vergabejahr je erhaltener Stufe, die nächste zu vergebende Stufe und Staffelhinweise.
 * Rein darstellend; Änderungen gehen als Ereignis an die Seite und werden dort gesammelt.
 */
@Component({
  selector: 'app-auszeichnungs-gruppe',
  imports: [MatChipsModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule],
  templateUrl: './auszeichnungs-gruppe.html',
  styleUrl: './auszeichnungs-gruppe.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuszeichnungsGruppe {
  readonly name = input.required<string>();
  /** Für die Lesehilfe der Chipliste, etwa der Nachname. */
  readonly person = input.required<string>();
  readonly stufen = input.required<readonly EhrungSchluessel[]>();
  readonly erhalten = input.required<Erhalten>();
  readonly anspruch = input.required<Anspruch>();
  readonly hinweise = input<readonly string[]>([]);

  readonly umgeschaltet = output<{ schluessel: EhrungSchluessel; angehakt: boolean }>();
  readonly jahrGeaendert = output<{ schluessel: EhrungSchluessel; text: string }>();

  protected readonly kurz = EHRUNG_KURZ;
  protected readonly bezeichnung = EHRUNG_BEZEICHNUNG;
  protected readonly jahrMinimum = VERGABEJAHR_MINIMUM;
  protected readonly jahrMaximum = VERGABEJAHR_MAXIMUM;
  protected readonly chipKlasse = chipKlasse;

  /** Was als „Zu vergeben“ erscheint: die nächste Stufe, sonst die zuletzt erfüllte. */
  protected readonly anzeigeStufe = computed(
    () => this.anspruch().naechste ?? this.anspruch().erfuellt,
  );

  protected hat(schluessel: EhrungSchluessel): boolean {
    return hatErhalten(this.erhalten(), schluessel);
  }

  protected jahrVon(schluessel: EhrungSchluessel): number | null {
    return this.erhalten()[schluessel] ?? null;
  }

  protected gesperrt(schluessel: EhrungSchluessel): boolean {
    return stufeGesperrt(this.erhalten(), schluessel);
  }

  protected jahrUebernehmen(schluessel: EhrungSchluessel, ereignis: Event): void {
    this.jahrGeaendert.emit({ schluessel, text: (ereignis.target as HTMLInputElement).value });
  }
}
