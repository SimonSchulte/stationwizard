import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Fortschritt } from '../../services/check-status';

/**
 * Klebender Kopf der Prüfseite: Fortschrittsring, Zähler und Hinweispillen.
 *
 * Der Ring ist ein Inline-SVG mit `stroke-dasharray` statt eines
 * Material-Bausteins, damit dieselbe Darstellung ohne Änderung auch im sehr
 * kleinen öffentlichen Build-Ziel funktioniert.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-check-fortschritt',
  templateUrl: './check-fortschritt.html',
  styleUrl: './check-fortschritt.less',
})
export class CheckFortschritt {
  readonly stand = input.required<Fortschritt>();
  readonly verfallsdatumErfasst = input(false);

  /** Umfang des Kreises mit Radius 16; Grundlage für `stroke-dasharray`. */
  private readonly umfang = 2 * Math.PI * 16;

  readonly kreisUmfang = this.umfang;

  readonly kreisFuellung = computed(() => (this.stand().prozent / 100) * this.umfang);

  readonly unvollstaendig = computed(() => this.stand().fehlmengen + this.stand().unbrauchbar);

  readonly verfallstext = computed(() => {
    const stand = this.stand();
    if (stand.abgelaufen > 0) {
      return stand.laeuftAb > 0
        ? `${stand.abgelaufen} abgelaufen · ${stand.laeuftAb} bald fällig`
        : `${stand.abgelaufen} abgelaufen`;
    }
    if (stand.laeuftAb > 0) return `${stand.laeuftAb} bald fällig`;
    // Ohne eine einzige Eingabe wäre "ohne Befund" eine Behauptung: geprüft
    // wurde dann nichts. Solange etwas fehlt, zeigt die Pille den Fortschritt.
    if (stand.verfallsdatenErfasst === 0) return 'Verfallsdaten offen';
    if (stand.verfallsdatenErfasst < stand.verfallsdatenGesamt) {
      return `${stand.verfallsdatenErfasst} von ${stand.verfallsdatenGesamt} Verfallsdaten`;
    }
    return 'Verfallsdaten ohne Befund';
  });

  readonly verfallsstufe = computed(() => {
    const stand = this.stand();
    if (stand.abgelaufen > 0) return 'abgelaufen';
    if (stand.laeuftAb > 0) return 'warnung';
    // Neutral, solange nicht alle erwarteten Daten erfasst sind: grün hieße
    // hier "geprüft und in Ordnung", und das stimmt erst am Ende.
    return stand.verfallsdatenErfasst < stand.verfallsdatenGesamt ? 'offen' : 'ok';
  });
}
