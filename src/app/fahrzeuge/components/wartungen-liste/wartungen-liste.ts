import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { heuteIso } from '../../../kern/kalender/datum';
import { Fahrzeugstamm } from '../../models/fahrzeug.model';
import { ermittleWartungsstatus, Wartungsstatus } from '../../services/wartungsstatus';

interface WartungMitFahrzeug {
  fahrzeug: Fahrzeugstamm;
  status: Wartungsstatus;
}

function tageBisFaelligText(tage: number): string {
  if (tage < 0) return `${Math.abs(tage)} Tage überfällig`;
  if (tage === 0) return 'heute fällig';
  return `in ${tage} Tagen fällig`;
}

/**
 * Vollständige Wartungsliste über alle Fahrzeuge – anders als die knappe
 * „Nächste Wartungen"-Übersicht im Dashboard mit optional sichtbaren
 * erledigten Terminen, als eigener Tab auf der Fuhrpark-Seite.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-wartungen-liste',
  imports: [RouterLink, MatCheckboxModule],
  templateUrl: './wartungen-liste.html',
  styleUrl: './wartungen-liste.less',
})
export class WartungenListe {
  readonly fahrzeuge = input.required<Fahrzeugstamm[]>();

  readonly tageBisFaelligText = tageBisFaelligText;
  readonly erledigteAnzeigen = signal(false);

  private readonly heute = heuteIso();

  readonly eintraege = computed<WartungMitFahrzeug[]>(() => {
    const nurOffene = !this.erledigteAnzeigen();
    const eintraege: WartungMitFahrzeug[] = [];
    for (const fahrzeug of this.fahrzeuge()) {
      for (const termin of fahrzeug.wartungstermine) {
        if (nurOffene && termin.erledigtAm !== null) continue;
        eintraege.push({ fahrzeug, status: ermittleWartungsstatus(termin, this.heute) });
      }
    }
    return eintraege.sort((a, b) => a.status.tageBisFaellig - b.status.tageBisFaellig);
  });
}
