import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AbschnittFarbe, VbLaufzettel } from '../../models/vb.model';
import { LaufzettelLayoutWahl } from '../../services/laufzettel-layout-wahl';
import { laufzettelPlatz } from '../../services/laufzettel-platz';

function gleich(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');
}

/** Abweichung der Karte von der Vorlage. */
export type LaufzettelMarke = 'geaendert' | 'neu';

/**
 * Karte eines Laufzettels in der Liste des VB-Editors: Farbstreifen in der Abschnittsfarbe,
 * laufende Nummer, als Hauptinformation „Lager → Ziel“ (das Ziel ist „Auf / In“, sonst der
 * Abschnitt, dann grau), darunter der Kurztext der Materialien und die Belegung
 * („6 / 23“, mit Zustandsfarbe und Symbol). Rein darstellend; ein Klick oder Enter/Leertaste
 * meldet `gewaehlt`.
 */
@Component({
  selector: 'app-laufzettel-karte',
  imports: [MatIconModule],
  templateUrl: './laufzettel-karte.html',
  styleUrl: './laufzettel-karte.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaufzettelKarte {
  readonly laufzettel = input.required<VbLaufzettel>();
  readonly nummer = input.required<number>();
  readonly farbe = input.required<AbschnittFarbe>();
  readonly ausgewaehlt = input(false);
  /** Titel des Abschnitts: das Ziel, wenn „Auf / In“ leer ist. */
  readonly abschnittTitel = input('');
  readonly marke = input<LaufzettelMarke | null>(null);
  readonly gewaehlt = output<void>();

  protected readonly streifen = computed(() => `var(--${this.farbe()})`);
  private readonly layout = inject(LaufzettelLayoutWahl);
  protected readonly platz = computed(() =>
    laufzettelPlatz(this.laufzettel(), this.layout.streifenJeSeite()),
  );

  protected readonly kurztext = computed(() => {
    const materialien = this.laufzettel()
      .positionen.filter((p) => !p.hinweis)
      .map((p) => p.material.trim())
      .filter((m) => m !== '');
    return materialien.length ? materialien.join(', ') : 'Keine Positionen';
  });

  protected readonly lager = computed(() => this.laufzettel().lagerort.trim());

  /** Ziel des Wegs: „Auf / In“, ohne Eintrag der Abschnitt (der das Schild trägt). */
  protected readonly ziel = computed(
    () => this.laufzettel().transportMit.trim() || this.abschnittTitel().trim() || 'Kein Ziel',
  );

  /** Grau gesetzt, wenn das Ziel nur der Abschnitt ist (leer oder gleich dem Abschnittstitel). */
  protected readonly zielAbgeleitet = computed(
    () =>
      this.laufzettel().transportMit.trim() === '' ||
      gleich(this.laufzettel().transportMit, this.abschnittTitel()),
  );

  protected readonly ortBeschreibung = computed(
    () => `Von ${this.lager() || 'unbekanntem Lager'} nach ${this.ziel()}`,
  );

  protected readonly platzBeschreibung = computed(() => {
    const { belegt, kapazitaet, zustand } = this.platz();
    return `${belegt} von ${kapazitaet} Zeilen belegt${zustand === 'zu-voll' ? ', passt nicht' : ''}`;
  });

  protected taste(ereignis: Event): void {
    ereignis.preventDefault();
    this.gewaehlt.emit();
  }
}
