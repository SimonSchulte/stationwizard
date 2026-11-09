import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

/**
 * Einheitliche Karte der Einstiegsseiten (Start, Angebotswesen, Verwaltung): Symbol, Titel,
 * Beschreibung und eine Aktionszeile. Mit `ziel` ist die ganze Karte ein Link, ohne `ziel` ein
 * Knopf, der `aktiviert` meldet (etwa zum Erzeugen eines Druckbogens). Weitere Inhalte, etwa
 * eine Fehlerzeile, werden hineinprojiziert.
 */
@Component({
  selector: 'app-einstiegskarte',
  imports: [NgTemplateOutlet, MatCardModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './einstiegskarte.html',
  styleUrl: './einstiegskarte.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Einstiegskarte {
  readonly icon = input.required<string>();
  readonly titel = input.required<string>();
  /** Beschriftung der Aktionszeile, etwa „Import öffnen“. */
  readonly aktion = input.required<string>();
  /** Routerziel; ohne Angabe wird die Karte zum Knopf. */
  readonly ziel = input<string | string[]>();
  readonly deaktiviert = input(false);
  readonly laedt = input(false);
  readonly laedtText = input('Wird erstellt …');
  readonly aktiviert = output<void>();
}
