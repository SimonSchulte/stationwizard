import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CheckpositionEingabe } from '../../models/check.model';
import { HERKUNFT_LABEL, PruefArtikel } from '../../models/pruefvorlage.model';
import { artikelVerfallsstatus, verfallsdatumStatus } from '../../services/check-status';

/**
 * Eine Position des Fahrzeugchecks: abhaken, Menge korrigieren, als unbrauchbar
 * melden und bei Bedarf je Stück ein Verfallsdatum erfassen.
 *
 * Bewusst ohne Material-Formularfelder: die Zeile kommt im Check gut hundertmal
 * vor, und die Bedienung soll am Finger großflächig und sofort sein statt
 * hübsch umrandet. Das Abhaken liegt auf der ganzen Zeile, nicht nur auf dem
 * Kästchen.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-check-position',
  imports: [MatIconModule],
  templateUrl: './check-position.html',
  styleUrl: './check-position.less',
})
export class CheckPosition {
  readonly artikel = input.required<PruefArtikel>();
  readonly position = input.required<CheckpositionEingabe>();
  readonly verfallsdatumErfassung = input(false);
  readonly heute = input.required<string>();

  readonly umschalten = output<void>();
  readonly mengeGeaendert = output<number>();
  readonly unbrauchbarGeaendert = output<boolean>();
  readonly verfallsdatumGeaendert = output<{ index: number; monat: string }>();
  readonly verfallsdatumFuerAlle = output<string>();

  readonly herkunftLabel = HERKUNFT_LABEL;

  readonly fehlmenge = computed(() => {
    const fehlt = this.artikel().sollMenge - this.position().istMenge;
    return fehlt > 0 ? fehlt : 0;
  });

  readonly zeigtVerfallsdaten = computed(
    () => this.verfallsdatumErfassung() && this.artikel().verfallsdatumPflicht,
  );

  readonly verfallsstatus = computed(() =>
    artikelVerfallsstatus(this.position().verfallsdaten, this.heute()),
  );

  readonly mehrereStueck = computed(() => this.artikel().sollMenge > 1);

  /**
   * Bei mehreren Stück wird standardmäßig **ein** gemeinsames Datum erfasst.
   * Zehn Felder untereinander sind am Telefon kaum zu bedienen, und in der
   * Praxis stammt eine Packung meist aus derselben Lieferung. Wer doch
   * unterschiedliche Daten hat, klappt die Einzelerfassung auf.
   */
  readonly einzelerfassung = signal(false);

  /** Das gemeinsame Datum, oder `''`, wenn sich die Stücke unterscheiden. */
  readonly gemeinsamesDatum = computed(() => {
    const daten = this.position().verfallsdaten;
    const erstes = daten[0] ?? '';
    return daten.every((datum) => (datum ?? '') === (erstes ?? '')) ? (erstes ?? '') : '';
  });

  readonly datenUneinheitlich = computed(() => {
    const daten = this.position().verfallsdaten;
    const erstes = daten[0] ?? '';
    return daten.some((datum) => (datum ?? '') !== (erstes ?? ''));
  });

  einheitText(): string {
    const einheit = this.artikel().einheit.trim();
    return einheit === '' ? 'Stück' : einheit;
  }

  statusEinesStuecks(index: number): string {
    return verfallsdatumStatus(this.position().verfallsdaten[index] ?? null, this.heute());
  }

  mengeVerringern(): void {
    const neu = Math.max(0, this.position().istMenge - 1);
    this.mengeGeaendert.emit(neu);
  }

  mengeErhoehen(): void {
    this.mengeGeaendert.emit(this.position().istMenge + 1);
  }

  mengeEingeben(wert: string): void {
    const zahl = Number.parseInt(wert, 10);
    // Eine unlesbare Eingabe bleibt unbeachtet, statt still auf null zu fallen.
    if (!Number.isInteger(zahl) || zahl < 0) return;
    this.mengeGeaendert.emit(zahl);
  }
}
