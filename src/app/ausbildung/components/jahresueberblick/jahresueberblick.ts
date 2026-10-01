import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { KATEGORIE_FARBEN } from '../../data/kategorien';
import { HiorgAbgleich } from '../../services/hiorg-abgleich';
import { UeberblickZelle, baueJahresueberblick } from '../../services/jahresueberblick';
import { WochenZeile } from '../../services/plan-raster';

const MONATSNAMEN = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleDateString('de-DE', { month: 'short' }),
);

/**
 * Ansicht B: Jahresüberblick. Nur die Diensttage des Jahres, zwölf Zeilen; die
 * Frage „Wo fehlt noch Ausbildung?“ beantwortet ein Blick. Rein darstellend:
 * ein Klick meldet das Datum, der Jahresplan öffnet dann den Monat.
 */
@Component({
  selector: 'app-jahresueberblick',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './jahresueberblick.html',
  styleUrl: './jahresueberblick.less',
})
export class Jahresueberblick {
  /** Alle Wochen des Jahres, ungefiltert. */
  readonly wochen = input.required<readonly WochenZeile[]>();
  readonly abgleich = input.required<HiorgAbgleich>();
  readonly heute = input.required<string>();
  readonly diensttagLabel = input('Montag');

  readonly tagGewaehlt = output<string>();

  readonly daten = computed(() =>
    baueJahresueberblick(this.wochen(), this.abgleich().tageMitAbweichung),
  );
  readonly monate = computed(() =>
    this.daten().monate.map((monat) => ({ ...monat, name: MONATSNAMEN[monat.index]! })),
  );
  readonly kategorien = computed(() =>
    [...this.daten().kennzahlen.nachKategorie].map(([kategorie, anzahl]) => ({
      text: kategorie || 'Ohne Kategorie',
      farbe: KATEGORIE_FARBEN[kategorie],
      anzahl,
    })),
  );

  farbe(zelle: UeberblickZelle): string {
    return KATEGORIE_FARBEN[zelle.kategorie];
  }
}
