import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Rahmen der Einstiegsseiten: gleiche Breite und Abstände, darin eine Einleitung
 * (`beschreibung`) und ein `app-einstiegsraster`. Mit `ueberschrift` (und optional
 * `einordnung`) entsteht der große Kopf der Startseite; Bereichsseiten lassen beides weg und
 * zeigen stattdessen den `app-seitenkopf` darüber.
 */
@Component({
  selector: 'app-einstiegsseite',
  templateUrl: './einstiegsseite.html',
  styleUrl: './einstiegsseite.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Einstiegsseite {
  readonly einordnung = input<string>();
  readonly ueberschrift = input<string>();
}
