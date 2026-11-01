import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AufgabenStoreService } from '../../../kern/aufgaben/aufgaben-store.service';
import type { Aufgabe } from '../../../kern/aufgaben/aufgabenquelle';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';

interface Gruppe {
  kennung: string;
  bezeichnung: string;
  aufgaben: readonly Aufgabe[];
}

/**
 * Übersicht aller offenen Aufgaben, nach Fachquelle gruppiert.
 *
 * Zeigt nur, was die aufrufende Person auch entscheiden darf – die Filterung
 * geschieht serverseitig in der jeweiligen Quelle, nicht hier.
 */
@Component({
  selector: 'app-aufgaben-uebersicht',
  imports: [
    DatePipe,
    Ladeanzeige,
    Leerzustand,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    Meldung,
    RouterLink,
    Seitenkopf,
  ],
  templateUrl: './aufgaben-uebersicht.html',
  styleUrl: './aufgaben-uebersicht.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AufgabenUebersicht {
  protected readonly store = inject(AufgabenStoreService);

  protected readonly gruppen = computed<readonly Gruppe[]>(() => {
    const bezeichnungen = this.store.bezeichnungen();
    const nachKennung = new Map<string, Aufgabe[]>();
    for (const aufgabe of this.store.aufgaben()) {
      const vorhandene = nachKennung.get(aufgabe.quelle);
      if (vorhandene) vorhandene.push(aufgabe);
      else nachKennung.set(aufgabe.quelle, [aufgabe]);
    }
    return [...nachKennung.entries()].map(([kennung, aufgaben]) => ({
      kennung,
      bezeichnung: bezeichnungen[kennung] ?? kennung,
      aufgaben,
    }));
  });

  protected readonly fehlerListe = computed(() => Object.entries(this.store.fehlerJeQuelle()));

  /** Öffentlich, damit Tests auf das erste Laden warten können. */
  readonly bereit: Promise<void>;

  constructor() {
    this.bereit = this.store.laden();
  }

  protected neuLaden(): void {
    void this.store.laden();
  }
}
