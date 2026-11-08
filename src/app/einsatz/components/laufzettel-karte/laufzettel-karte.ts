import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AbschnittFarbe, VbLaufzettel } from '../../models/vb.model';
import { LaufzettelLayoutWahl } from '../../services/laufzettel-layout-wahl';
import { laufzettelPlatz } from '../../services/laufzettel-platz';
import { FachgruppeChip } from '../fachgruppe-chip/fachgruppe-chip';

function gleich(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');
}

/** Abweichung der Karte von der Vorlage. */
export type LaufzettelMarke = 'geaendert' | 'neu';

/**
 * Karte eines Laufzettels in der Liste des VB-Editors: Farbstreifen in der Abschnittsfarbe,
 * laufende Nummer, als Hauptinformation „Von Lagerort → Auf/In Transport“, darunter der Kurztext der Materialien, Fachgruppe und Belegung
 * („6 / 23“, mit Zustandsfarbe und Symbol). Rein darstellend; ein Klick oder Enter/Leertaste
 * meldet `gewaehlt`.
 */
@Component({
  selector: 'app-laufzettel-karte',
  imports: [MatIconModule, FachgruppeChip],
  templateUrl: './laufzettel-karte.html',
  styleUrl: './laufzettel-karte.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaufzettelKarte {
  readonly laufzettel = input.required<VbLaufzettel>();
  readonly nummer = input.required<number>();
  readonly farbe = input.required<AbschnittFarbe>();
  readonly ausgewaehlt = input(false);
  /** Titel des Abschnitts; „Auf/In“ steht nur auf der Karte, wenn er davon abweicht. */
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
      .positionen.map((p) => p.material.trim())
      .filter((m) => m !== '');
    return materialien.length ? materialien.join(', ') : 'Keine Positionen';
  });

  protected readonly ort = computed(() => {
    const { lagerort } = this.laufzettel();
    const transportMit = gleich(this.laufzettel().transportMit, this.abschnittTitel())
      ? ''
      : this.laufzettel().transportMit;
    if (lagerort && transportMit) return `Von ${lagerort} → Auf/In ${transportMit}`;
    if (lagerort) return `Von ${lagerort}`;
    if (transportMit) return `Auf/In ${transportMit}`;
    return 'Kein Ziel angegeben';
  });

  protected readonly platzBeschreibung = computed(() => {
    const { belegt, kapazitaet, zustand } = this.platz();
    return `${belegt} von ${kapazitaet} Zeilen belegt${zustand === 'zu-voll' ? ', passt nicht' : ''}`;
  });

  protected taste(ereignis: Event): void {
    ereignis.preventDefault();
    this.gewaehlt.emit();
  }
}
