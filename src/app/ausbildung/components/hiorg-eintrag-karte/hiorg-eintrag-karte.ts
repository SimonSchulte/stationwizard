import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { formatiereDatum, tageVonBis } from '../../../kern/kalender/datum';
import {
  artName,
  hiorgServerLink,
  istMehrtaegig,
  type HiorgEintrag,
} from '../../models/hiorg-kalender.model';
import type { HiorgAbweichung } from '../../services/hiorg-abgleich';

/**
 * Ein Termin aus dem HiOrg-Server im Jahresraster.
 *
 * Bewusst anders gestaltet als `app-termin-karte`: der Eintrag stammt nicht aus
 * der Excel-Mappe und darf nicht mit einem Plantermin verwechselt werden.
 */
@Component({
  selector: 'app-hiorg-eintrag-karte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './hiorg-eintrag-karte.html',
  styleUrl: './hiorg-eintrag-karte.less',
  host: {
    '[class.kompakt]': 'kompakt()',
    '[class.abweichend]': 'abweichungen().length > 0',
    '[class.ohne-gegenstueck]': 'ohneGegenstueck()',
  },
})
export class HiorgEintragKarte {
  readonly eintrag = input.required<HiorgEintrag>();
  /** Der Tag, an dem diese Karte steht – bei mehrtägigen Terminen nicht der Beginn. */
  readonly datum = input.required<string>();
  /** Plantermine desselben Tages, deren Thema nicht exakt passt. */
  readonly abweichungen = input<readonly HiorgAbweichung[]>([]);
  /** Kein benanntes Ausbildungsthema an diesem Tag. */
  readonly ohneGegenstueck = input(false);
  readonly kompakt = input(true);

  readonly nameUebernehmen = output<HiorgAbweichung>();
  readonly terminAnlegen = output<HiorgEintrag>();

  readonly artText = computed(() => artName(this.eintrag().art));
  readonly mehrtaegig = computed(() => istMehrtaegig(this.eintrag()));
  /** Direktlink auf die Detailseite im HiOrg-Server, passend zu `art` (Termin/Dienst). */
  readonly link = computed(() => hiorgServerLink(this.eintrag()));

  /** „Tag 2/4" – nur bei mehrtägigen Terminen. */
  readonly tagesFortschritt = computed(() => {
    const eintrag = this.eintrag();
    if (!istMehrtaegig(eintrag)) {
      return '';
    }
    const tage = tageVonBis(eintrag.beginn, eintrag.ende);
    const index = tage.indexOf(this.datum());
    return index < 0 ? '' : `Tag ${index + 1}/${tage.length}`;
  });

  /** „18:00–21:30", „ab 18:00" oder leer – der Feed nennt nicht immer beides. */
  readonly zeitText = computed(() => {
    const { beginnZeit, endeZeit } = this.eintrag();
    if (!beginnZeit) {
      return '';
    }
    // Bei mehrtägigen Einträgen gehört das Ende zu einem anderen Tag; dann nur
    // den Beginn zeigen, statt eine falsche Tagesspanne zu behaupten.
    return endeZeit && !istMehrtaegig(this.eintrag()) ? `${beginnZeit}–${endeZeit}` : beginnZeit;
  });

  readonly zeitraumText = computed(() => {
    const eintrag = this.eintrag();
    return istMehrtaegig(eintrag)
      ? `${formatiereDatum(eintrag.beginn)}–${formatiereDatum(eintrag.ende)}`
      : formatiereDatum(eintrag.beginn);
  });

  readonly warnhinweis = computed(() => {
    const abweichungen = this.abweichungen();
    if (abweichungen.length === 0) {
      return '';
    }
    const themen = abweichungen.map((a) => `„${a.terminThema}“`).join(', ');
    return `Der Jahresdienstplan nennt hier ${themen}, HiOrg nennt „${this.eintrag().name}“.`;
  });
}
