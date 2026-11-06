import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MONATSNAMEN } from '../../../kern/kalender/datum';
import { abstandZuHeute } from '../../services/datum-anzeige';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KATEGORIE_FARBEN } from '../../data/kategorien';
import { HiorgAbgleich } from '../../services/hiorg-abgleich';
import { UeberblickZelle, baueJahresueberblick } from '../../services/jahresueberblick';
import { WochenZeile } from '../../services/plan-raster';

/**
 * Ansicht B: Jahresüberblick. Nur die Diensttage des Jahres, zwölf Zeilen; die
 * Frage „Wo fehlt noch Ausbildung?“ beantwortet ein Blick. Rein darstellend:
 * ein Klick meldet das Datum, der Jahresplan öffnet dann den Monat.
 */
@Component({
  selector: 'app-jahresueberblick',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
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
  /** Neuer Termin an einem freien Diensttag. */
  readonly anlegen = output<string>();

  readonly daten = computed(() =>
    baueJahresueberblick(this.wochen(), this.abgleich().tageMitAbweichung),
  );
  readonly monate = computed(() => {
    const heute = this.heute();
    return this.daten().monate.map((monat) => ({
      ...monat,
      name: MONATSNAMEN[monat.index]!,
      kurz: MONATSNAMEN[monat.index]!.slice(0, 3).toUpperCase(),
      /** Jeder zweite Monat (Januar, März, …) ist getönt, wie in Monat und Liste. */
      ungerade: (monat.index + 1) % 2 === 1,
      laufend: monat.zellen.some((z) => z.datum.slice(0, 7) === heute.slice(0, 7)),
      zellen: monat.zellen.map((zelle) => ({
        ...zelle,
        tagZahl: String(Number(zelle.nummer)),
        vorbei: zelle.datum < heute,
        abstand: abstandZuHeute(zelle.datum, heute, zelle.luecke && !zelle.feiertag),
      })),
    }));
  });
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
